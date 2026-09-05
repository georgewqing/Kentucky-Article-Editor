/**
 * Tiny RFC 6455 WebSocket server (zero dependencies) — just enough for the
 * KENTUCKY IPC bridge: browser sends masked text frames (JSON), server sends
 * unmasked text frames, with ping/close handling.
 */
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Socket } from 'node:net'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function encodeFrame(payload: Buffer, opcode: number): Buffer {
  const len = payload.length
  let header: Buffer
  if (len < 126) {
    header = Buffer.alloc(2)
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  header[0] = 0x80 | opcode
  return Buffer.concat([header, payload])
}

interface ParsedFrame {
  fin: boolean
  opcode: number
  payload: Buffer
  total: number
}

function parseFrame(buf: Buffer): ParsedFrame | null {
  if (buf.length < 2) return null
  const b0 = buf[0]
  const b1 = buf[1]
  const masked = (b1 & 0x80) !== 0
  let len = b1 & 0x7f
  let offset = 2
  if (len === 126) {
    if (buf.length < 4) return null
    len = buf.readUInt16BE(2)
    offset = 4
  } else if (len === 127) {
    if (buf.length < 10) return null
    len = Number(buf.readBigUInt64BE(2))
    offset = 10
  }
  let mask: Buffer | null = null
  if (masked) {
    if (buf.length < offset + 4) return null
    mask = buf.subarray(offset, offset + 4)
    offset += 4
  }
  if (buf.length < offset + len) return null
  let payload = buf.subarray(offset, offset + len)
  if (masked && mask) {
    const out = Buffer.allocUnsafe(len)
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3]
    payload = out
  }
  return { fin: (b0 & 0x80) !== 0, opcode: b0 & 0x0f, payload, total: offset + len }
}

export class WsConn extends EventEmitter {
  private socket: Socket
  private buffer = Buffer.alloc(0)
  private fragments: Buffer[] = []
  private closed = false

  constructor(socket: Socket) {
    super()
    this.socket = socket
    socket.on('data', (chunk) => this.onData(chunk))
    socket.on('close', () => this.handleClose())
    socket.on('error', () => this.handleClose())
  }

  private handleClose(): void {
    if (this.closed) return
    this.closed = true
    this.emit('close')
    this.removeAllListeners()
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length > 0) {
      const frame = parseFrame(this.buffer)
      if (!frame) break
      this.buffer = this.buffer.subarray(frame.total)

      if (frame.opcode === 0x8) {
        // close
        this.sendFrame(Buffer.alloc(0), 0x8)
        try {
          this.socket.end()
        } catch {
          /* ignore */
        }
        this.handleClose()
        return
      }
      if (frame.opcode === 0x9) {
        // ping -> pong
        this.sendFrame(frame.payload, 0xa)
        continue
      }
      if (frame.opcode === 0xa) continue // pong

      if (frame.opcode === 0x1) {
        this.fragments = [frame.payload]
        if (!frame.fin) continue
      } else if (frame.opcode === 0x0) {
        this.fragments.push(frame.payload)
        if (!frame.fin) continue
      } else {
        continue // binary unsupported
      }

      const text = Buffer.concat(this.fragments).toString('utf8')
      this.fragments = []
      try {
        this.emit('message', JSON.parse(text))
      } catch {
        /* ignore malformed JSON */
      }
    }
  }

  private sendFrame(payload: Buffer, opcode: number): void {
    if (this.closed) return
    try {
      this.socket.write(encodeFrame(payload, opcode))
    } catch {
      this.handleClose()
    }
  }

  sendJson(obj: unknown): void {
    this.sendFrame(Buffer.from(JSON.stringify(obj), 'utf8'), 0x1)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.socket.write(encodeFrame(Buffer.alloc(0), 0x8))
      this.socket.end()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Attach WebSocket upgrade handling for a single path. `authorize` can reject
 * the upgrade (returns false) before the 101 response.
 */
export function attachWsServer(
  server: HttpServer,
  pathname: string,
  onConnection: (conn: WsConn, req: IncomingMessage) => void,
  authorize?: (req: IncomingMessage) => boolean
): void {
  server.on('upgrade', (req, socket) => {
    let urlPath = '/'
    try {
      urlPath = new URL(req.url || '/', 'http://localhost').pathname
    } catch {
      /* ignore */
    }
    if (urlPath !== pathname || (authorize && !authorize(req))) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    const key = req.headers['sec-websocket-key']
    if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    const conn = new WsConn(socket as Socket)
    onConnection(conn, req)
  })
}
