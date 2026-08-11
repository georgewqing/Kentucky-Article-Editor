/**
 * Heuristic ghost-character detection for continuity_check / prose warnings.
 * Avoids naive CJK {2,4} windows (false positives like 第一章 / 钟楼 / 白鲸号 / 阿矾把信).
 */

export type GhostNameHit = {
  name: string
  quote: string
  confidence: 'high' | 'medium'
  reason: string
  count: number
}

/** Single-char surnames (common). Multi-char handled separately. */
const SINGLE_SURNAMES =
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳唐罗薛伍余米贝姚孟顾尹江钟徐邱骆高夏蔡田樊胡凌霍虞万支柯卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公肖'
// note: omitted 水/管 — too often verbs/measure phrases (水泡得、管收件)

const MULTI_SURNAMES = [
  '司马',
  '欧阳',
  '上官',
  '夏侯',
  '诸葛',
  '东方',
  '皇甫',
  '尉迟',
  '公羊',
  '澹台',
  '公冶',
  '宗政',
  '濮阳',
  '淳于',
  '单于',
  '太叔',
  '申屠',
  '公孙',
  '仲孙',
  '轩辕',
  '令狐',
  '钟离',
  '宇文',
  '长孙',
  '慕容',
  '鲜于',
  '闾丘',
  '司徒',
  '司空',
  '亓官',
  '司寇',
  '子车',
  '颛孙',
  '端木',
  '巫马',
  '公西',
  '漆雕',
  '乐正',
  '壤驷',
  '公良',
  '拓跋',
  '夹谷',
  '宰父',
  '谷梁',
  '呼延',
  '羊舌',
  '微生',
  '梁丘',
  '左丘',
  '东门',
  '西门',
  '南宫'
]

const ROLE_AS_NAME = [
  '管事',
  '掌柜',
  '老板',
  '店主',
  '船长',
  '大副',
  '舵手',
  '管家',
  '账房',
  '捕头',
  '衙役',
  '伙计',
  '小二',
  '酒保',
  '车夫',
  '马夫',
  '侍卫',
  '祭司',
  '神官',
  '向导',
  '佣兵',
  '剑士',
  '骑士',
  '法师',
  '巫师',
  '刺客',
  '盗贼',
  '店员'
]

const STOP_OR_FUNCTION = new Set([
  '但是',
  '可以',
  '自己',
  '什么',
  '没有',
  '已经',
  '因为',
  '所以',
  '他们',
  '我们',
  '你们',
  '一个',
  '这里',
  '那里',
  '时候',
  '现在',
  '然后',
  '知道',
  '看见',
  '起来',
  '下去',
  '过来',
  '过去',
  '出来',
  '进去',
  '开始',
  '继续',
  '忽然',
  '突然',
  '终于',
  '于是',
  '其实',
  '只是',
  '还是',
  '就是',
  '不是',
  '如果',
  '虽然',
  '然而',
  '而且',
  '并且',
  '或者',
  '这个',
  '那个',
  '这些',
  '那些',
  '如此',
  '怎样',
  '如何',
  '为何',
  '今日',
  '昨日',
  '明日',
  '今天',
  '昨天',
  '明天',
  '上午',
  '下午',
  '晚上',
  '夜里',
  '此时',
  '此刻',
  '当地',
  '地方',
  '东西',
  '事情',
  '问题',
  '情况',
  '样子',
  '声音',
  '目光',
  '心里',
  '身上',
  '手中',
  '眼前',
  '身后',
  '面前',
  '左右',
  '上下',
  '内外',
  '之间',
  '之中',
  '之后',
  '之前',
  '第一章',
  '第二章',
  '第三章',
  '第四章',
  '第五章',
  '序章',
  '尾声',
  '正文',
  '标题',
  '内容',
  '人物',
  '角色',
  '场景',
  '剧情',
  '故事',
  '小说',
  '章节',
  '小姐',
  '小时',
  '小心',
  '老师',
  '先生',
  '夫人',
  '大人'
])

const BAD_GIVEN_CHAR = new Set(
  '的了着过是在有和与或把被让给向从到对说道问答看见来去出进上下中时候里外后前会得票船泡收件楼街巷'.split('')
)

/** 老/小 + 通用词，不是人名 */
const PREFIX_SKIP = new Set([
  '小姐',
  '小时',
  '小说',
  '小心',
  '老师',
  '老头',
  '老虎',
  '老鼠',
  '老板',
  '老人',
  '老是',
  '老早',
  '老实',
  '老样',
  '老规',
  '老几',
  '老大',
  '老二',
  '老三',
  '小子',
  '小孩',
  '小字',
  '小弟',
  '小伙',
  '小船',
  '小河',
  '小山',
  '小会',
  '小得',
  '小报'
])

/** Measure / verb phrases that look like 姓+名 (张船票、钟楼会). */
const FALSE_SURNAME_PHRASES = new Set([
  '张船票',
  '张票',
  '钟楼会',
  '管收件',
  '水泡得',
  '一条船',
  '一张'
])


function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function quoteAround(text: string, at: number, len: number): string {
  return text
    .slice(Math.max(0, at - 14), Math.min(text.length, at + len + 14))
    .replace(/\s+/g, ' ')
    .trim()
}

export function isRegisteredCastName(
  name: string,
  castNames: string[],
  castIds: Set<string>
): boolean {
  const t = name.trim()
  if (!t) return true
  if (castIds.has(t.toLowerCase())) return true
  for (const c of castNames) {
    const n = c.trim()
    if (!n) continue
    if (n === t) return true
    if (n.length >= 2 && (n.includes(t) || t.includes(n))) return true
  }
  return false
}

/** Place / chapter / vessel / function — not a person. */
export function isLikelyNonPersonToken(name: string): boolean {
  const t = name.trim()
  if (t.length < 2 || t.length > 4) return true
  if (STOP_OR_FUNCTION.has(t)) return true
  if (PREFIX_SKIP.has(t)) return true
  if (FALSE_SURNAME_PHRASES.has(t)) return true
  if (/^第[零一二三四五六七八九十百千两\d]+[章节回卷部篇幕]$/.test(t)) return true
  if (/^[零一二三四五六七八九十百千两\d]+[章节回卷部篇幕]$/.test(t)) return true
  if (/[楼街巷道桥门墙园院馆店寺庙宫府庄村镇城港岛山河湖海崖谷关隘堡寨台堂殿阁塔]$/.test(t)) {
    return true
  }
  if (/号$/.test(t)) return true
  // verb / speech leftovers on the name itself
  if (/[说问答喊叫道会得]$/.test(t)) return true
  // place/object inside: 钟楼会、张船票、水泡得
  if (/[楼街巷船票泡]/.test(t)) return true
  // compounds like 阿矾把信 / 管收件
  if (t.length >= 3 && /[把将收]/.test(t)) return true
  if (/[把将给的了着过得]$/.test(t) && t.length >= 3) return true
  if (/^(把|将|被|让|给|管收|水泡)/.test(t)) return true
  return false
}

/** Following characters often mean the match is mid-phrase, not a name. */
function followingBreaksName(text: string, index: number, name: string): boolean {
  const after = text.slice(index + name.length, index + name.length + 2)
  if (!after) return false
  // 老规|矩、小字|报、张船|票、钟楼|会、水泡|得
  if (/^[矩实是早样虎鼠大少孩子集字时候票船件会得的了着过张条个只次]/.test(after)) return true
  if (name.startsWith('老') && /^[矩人]/.test(after)) return true
  if (name.startsWith('小') && /^[字孩]/.test(after)) return true
  return false
}

type Bag = Map<
  string,
  { count: number; quote: string; confidence: 'high' | 'medium'; reason: string }
>

function addCandidate(
  bag: Bag,
  name: string,
  text: string,
  index: number,
  confidence: 'high' | 'medium',
  reason: string,
  castNames: string[],
  castIds: Set<string>
): void {
  const t = name.trim()
  if (t.length < 2 || t.length > 4) return
  if (isLikelyNonPersonToken(t)) return
  if (followingBreaksName(text, index, t)) return
  if (isRegisteredCastName(t, castNames, castIds)) return
  const prev = bag.get(t)
  const quote = quoteAround(text, index, t.length)
  if (!prev) {
    bag.set(t, { count: 1, quote, confidence, reason })
    return
  }
  prev.count += 1
  if (confidence === 'high' && prev.confidence !== 'high') {
    prev.confidence = 'high'
    prev.reason = reason
  }
  if (quote.length > prev.quote.length) prev.quote = quote
}

function buildSurnameRegex(): RegExp {
  const parts = [...MULTI_SURNAMES, ...SINGLE_SURNAMES.split('')].map(escapeRe)
  // Longer first so 欧阳 matches before 欧
  parts.sort((a, b) => b.length - a.length)
  return new RegExp(`(?:${parts.join('|')})[\\u4e00-\\u9fff]{1,2}`, 'g')
}

const SURNAME_RE = buildSurnameRegex()

/**
 * Extract likely person-name ghosts. Does NOT use raw overlapping CJK {2,4} dumps.
 */
export function findGhostCharacterHits(
  text: string,
  castNames: string[],
  castIds: Set<string>,
  opts?: { maxHits?: number }
): GhostNameHit[] {
  const bag: Bag = new Map()
  const maxHits = opts?.maxHits ?? 12

  // 1) 老X / 阿X / 小X（均单字名，避免「小字报」）
  const prefixRe = /(?:老|阿|小)[\u4e00-\u9fff]/g
  let m: RegExpExecArray | null
  while ((m = prefixRe.exec(text))) {
    if (PREFIX_SKIP.has(m[0])) continue
    // 小字|报、老规|矩 — 后续字打断
    if (followingBreaksName(text, m.index, m[0])) continue
    addCandidate(bag, m[0], text, m.index, 'high', 'honorific_prefix', castNames, castIds)
  }

  // 2) 姓 + 名
  SURNAME_RE.lastIndex = 0
  while ((m = SURNAME_RE.exec(text))) {
    const name = m[0]
    const sn = MULTI_SURNAMES.find((s) => name.startsWith(s)) || name.slice(0, 1)
    const given = name.slice(sn.length)
    if (!given || Array.from(given).some((ch) => BAD_GIVEN_CHAR.has(ch))) continue
    addCandidate(bag, name, text, m.index, 'medium', 'surname_given', castNames, castIds)
  }

  // 3) 职衔当称呼（管事…）
  for (const role of ROLE_AS_NAME) {
    let from = 0
    for (;;) {
      const at = text.indexOf(role, from)
      if (at < 0) break
      addCandidate(bag, role, text, at, 'high', 'role_title', castNames, castIds)
      from = at + role.length
    }
  }

  // 4) 说话归因
  const speechRe2 =
    /([\u4e00-\u9fff]{2,3})(?:说道|问道|答道|喝道|喊道|笑道|叹道|怒道|说|问|答|喊|叫)/g
  while ((m = speechRe2.exec(text))) {
    addCandidate(bag, m[1], text, m.index, 'medium', 'speech_verb', castNames, castIds)
  }

  const raw: GhostNameHit[] = []
  for (const [name, info] of Array.from(bag.entries())) {
    const need = info.confidence === 'high' ? 1 : 2
    if (info.count < need) continue
    raw.push({
      name,
      quote: info.quote,
      confidence: info.confidence,
      reason: info.reason,
      count: info.count
    })
  }

  raw.sort((a, b) => b.name.length - a.name.length || b.count - a.count)
  const kept: GhostNameHit[] = []
  for (const hit of raw) {
    if (kept.some((k) => k.name.includes(hit.name))) continue
    kept.push(hit)
    if (kept.length >= maxHits) break
  }
  return kept
}
