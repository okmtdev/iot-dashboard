// 依存ゼロの小さな Markdown レンダラー。
// パース結果を HTML 文字列ではなく DOM ノードとして組み立てるため、
// ユーザー入力による HTML/スクリプト注入（XSS）の心配がない。
//
// 対応記法: 見出し(# 〜 ######) / 太字 / 斜体 / 打ち消し / インラインコード /
//           コードブロック(```) / 箇条書き・番号リスト / チェックリスト(- [ ]) /
//           引用(>) / 水平線(---) / リンク / 段落・改行 / バックスラッシュエスケープ

function el(tag, className, ...children) {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const c of children) {
    if (c == null) continue
    node.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return node
}

// 安全な URL のみ許可（javascript: 等は拒否）。ドメインのみの場合は https:// を補う。
function safeUrl(url) {
  const u = String(url).trim()
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u
  if (/^[/#]/.test(u)) return u
  if (/^[\w.-]+\.[a-z]{2,}([/?#]|$)/i.test(u)) return 'https://' + u
  return null
}

function inlineEl(tag, className, inner) {
  const node = el(tag, className)
  for (const child of parseInline(inner)) node.append(child)
  return node
}

function makeLink(text, url) {
  const safe = safeUrl(url)
  if (!safe) return document.createTextNode(`[${text}](${url})`)
  const a = el('a', 'md-link')
  a.href = safe
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  for (const child of parseInline(text)) a.append(child)
  return a
}

const INLINE_RULES = [
  { re: /\\([\\`*_~[\]()#>+\-.!])/, make: (m) => document.createTextNode(m[1]) },
  { re: /`([^`]+)`/, make: (m) => el('code', 'md-code', m[1]) },
  { re: /\*\*([^\n]+?)\*\*/, make: (m) => inlineEl('strong', null, m[1]) },
  { re: /__([^\n]+?)__/, make: (m) => inlineEl('strong', null, m[1]) },
  { re: /~~([^\n]+?)~~/, make: (m) => inlineEl('del', null, m[1]) },
  { re: /\*([^*\n]+?)\*/, make: (m) => inlineEl('em', null, m[1]) },
  { re: /(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/, make: (m) => inlineEl('em', null, m[1]) },
  { re: /\[([^\]]+)\]\(([^)\s]+)\)/, make: (m) => makeLink(m[1], m[2]) },
]

function parseInline(text) {
  const out = []
  let rest = String(text)
  let guard = 0
  while (rest && guard++ < 5000) {
    let best = null
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest)
      if (m && (best == null || m.index < best.m.index)) best = { rule, m }
      if (best && best.m.index === 0) break
    }
    if (!best) {
      out.push(document.createTextNode(rest))
      break
    }
    if (best.m.index > 0) out.push(document.createTextNode(rest.slice(0, best.m.index)))
    out.push(best.rule.make(best.m))
    rest = rest.slice(best.m.index + best.m[0].length)
  }
  return out
}

function parseBlocks(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (/^\s*$/.test(line)) {
      i++
      continue
    }

    // コードブロック ```
    if (/^```/.test(line)) {
      const body = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++])
      i++ // 閉じ ``` をスキップ
      blocks.push(el('pre', 'md-pre', el('code', null, body.join('\n'))))
      continue
    }

    // 見出し
    const head = /^(#{1,6})\s+(.*)$/.exec(line)
    if (head) {
      const level = head[1].length
      blocks.push(inlineEl('h' + level, `md-h md-h${level}`, head[2].trim()))
      i++
      continue
    }

    // 水平線
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(el('hr', 'md-hr'))
      i++
      continue
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const body = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      const bq = el('blockquote', 'md-quote')
      for (const child of parseBlocks(body.join('\n'))) bq.append(child)
      blocks.push(bq)
      continue
    }

    // リスト（箇条書き / 番号 / チェック）
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const listEl = el(ordered ? 'ol' : 'ul', 'md-list')
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')
        const li = el('li', 'md-li')
        const task = /^\[([ xX])\]\s+(.*)$/.exec(item)
        if (task) {
          const cb = el('input', 'md-check')
          cb.type = 'checkbox'
          cb.checked = task[1].toLowerCase() === 'x'
          cb.disabled = true
          li.classList.add('md-task')
          if (cb.checked) li.classList.add('md-task-done')
          li.append(cb)
          for (const child of parseInline(task[2])) li.append(child)
        } else {
          for (const child of parseInline(item)) li.append(child)
        }
        listEl.append(li)
        i++
      }
      blocks.push(listEl)
      continue
    }

    // 段落（空行・特殊行が来るまで連結。段落内の改行は <br>）
    const para = []
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      para.push(lines[i++])
    }
    const p = el('p', 'md-p')
    para.forEach((ln, idx) => {
      if (idx > 0) p.append(el('br'))
      for (const child of parseInline(ln)) p.append(child)
    })
    blocks.push(p)
  }
  return blocks
}

// Markdown 文字列を .md-body コンテナ要素に描画して返す
export function renderMarkdown(src) {
  const container = el('div', 'md-body')
  for (const block of parseBlocks(src)) container.append(block)
  return container
}
