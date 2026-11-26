import { Children, cloneElement, isValidElement, memo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Renders agent answers as Markdown (GitHub flavour: tables, lists, code) and turns
// ServiceNow / Dynatrace ids into chips. react-markdown builds React elements and
// never injects raw HTML, so model output can't smuggle markup into the page.

const ID_SRC = '\\b(INC\\d{6,8}|CHG\\d{6,8}|RITM\\d{6,8}|REQ\\d{6,8}|KB\\d{6,8}|P-\\d{5,8})\\b'
// Separate regexes: a shared /g regex keeps lastIndex between calls and silently skips matches.
const HAS_ID = new RegExp(ID_SRC)

const idKind = (id: string) =>
  id.startsWith('INC') ? { tone: 'inc', label: 'ServiceNow incident' }
  : id.startsWith('CHG') ? { tone: 'chg', label: 'ServiceNow change request' }
  : id.startsWith('KB') ? { tone: 'kb', label: 'Knowledge article' }
  : id.startsWith('P-') ? { tone: 'dt', label: 'Dynatrace problem' }
  : { tone: 'req', label: 'ServiceNow request' }

export function IdChip({ id }: { id: string }) {
  const k = idKind(id)
  return (
    <a className={`idchip idchip--${k.tone}`} href={`#${id}`} title={k.label}>
      {id}
    </a>
  )
}

function chipifyString(s: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of s.matchAll(new RegExp(ID_SRC, 'g'))) {
    const i = m.index ?? 0
    if (i > last) out.push(s.slice(last, i))
    out.push(<IdChip key={`${keyBase}-${i}`} id={m[0]} />)
    last = i + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

/** Replace ids in string children (recursing into inline elements such as strong/em). */
export function chipify(children: ReactNode, keyBase = 'c'): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child === 'string') {
      return HAS_ID.test(child) ? chipifyString(child, `${keyBase}${idx}`) : child
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.type !== 'code' && child.type !== 'a' && child.props.children) {
      return cloneElement(child, undefined, chipify(child.props.children, `${keyBase}${idx}-`))
    }
    return child
  })
}

const components: Components = {
  p: ({ children }) => <p>{chipify(children)}</p>,
  li: ({ children }) => <li>{chipify(children)}</li>,
  td: ({ children, style }) => <td style={style}>{chipify(children)}</td>,
  th: ({ children, style }) => <th style={style}>{children}</th>,
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h4>{children}</h4>,
  table: ({ children }) => (
    <div className="md__table" role="region" aria-label="Table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
  ),
  img: () => null,
}

export const Markdown = memo(function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
})

/** Plain inline text with id chips, for short strings (plan steps, evidence lines). */
export const Inline = memo(function Inline({ text }: { text: string }) {
  return <>{HAS_ID.test(text) ? chipifyString(text, 'i') : text}</>
})
