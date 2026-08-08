/// <reference types="vite/client" />

export {}

declare global {
  interface OpenFilePickerOptions {
    multiple?: boolean
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }

  interface DirectoryPickerOptions {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandle {
    kind: 'file' | 'directory'
    name: string
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    kind: 'file'
    getFile(): Promise<File>
    createWritable(): Promise<FileSystemWritableFileStream>
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: 'directory'
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: BufferSource | Blob | string): Promise<void>
    close(): Promise<void>
  }

  interface Window {
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  }
}
