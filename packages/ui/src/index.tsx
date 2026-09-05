'use client'

import { useRef, useState, type ReactNode, type PointerEvent, type ButtonHTMLAttributes } from 'react'

export function CommonsButton({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button type="button" className={`ac-button ac-button-${variant} ${className}`} {...props} />
}
export function CanvasShell({ toolbar, left, right, bottom, children, className = '' }: { toolbar: ReactNode; left?: ReactNode; right?: ReactNode; bottom?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={`ac-canvas ${className}`}><header className="ac-canvas-toolbar">{toolbar}</header><div className="ac-canvas-body">{left && <aside className="ac-canvas-left">{left}</aside>}<main className="ac-canvas-center">{children}{bottom && <section className="ac-canvas-bottom" aria-label="Diagnostics">{bottom}</section>}</main>{right && <aside className="ac-canvas-right">{right}</aside>}</div></div>
}
export type CompiledPreview = { type: 'html'; html: string } | { type: 'url'; url: string } | { type: 'unavailable'; error: string }
export function CompiledArtifactFrame({ preview, title, className = '', revision }: { preview: CompiledPreview; title: string; className?: string; revision?: string | number }) {
  const [failed, setFailed] = useState(false)
  if (preview.type === 'unavailable') return <div role="status" className="ac-preview-error">{preview.error}</div>
  if (preview.type === 'url' && !/^https?:\/\//i.test(preview.url)) return <div role="alert" className="ac-preview-error">The compiled preview URL is invalid.</div>
  return <div className={`ac-compiled-frame ${className}`}>{failed && <div role="alert" className="ac-preview-error">Preview could not load. Rebuild this revision to try again.</div>}<iframe key={revision} title={title} src={preview.type === 'url' ? preview.url : undefined} srcDoc={preview.type === 'html' ? preview.html : undefined} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'" onLoad={() => setFailed(false)} onError={() => setFailed(true)} /></div>
}
export type AnnotationGeometry = { x: number; y: number; width?: number; height?: number }
export type CanvasNote = AnnotationGeometry & { id: string; body: string; status?: 'open' | 'resolved' }
export function AnnotationLayer({ tool, notes, onCreate, onSelect }: { tool: 'select' | 'point' | 'region'; notes: readonly CanvasNote[]; onCreate: (geometry: AnnotationGeometry) => void; onSelect?: (note: CanvasNote) => void }) {
  const origin = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<AnnotationGeometry | null>(null)
  function point(event: PointerEvent<HTMLDivElement>) { const r = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX-r.left)/r.width)), y: Math.max(0, Math.min(1, (event.clientY-r.top)/r.height)) } }
  function rect(end: { x: number; y: number }) { const start = origin.current!; return { x: Math.min(start.x,end.x), y: Math.min(start.y,end.y), width: Math.abs(end.x-start.x), height: Math.abs(end.y-start.y) } }
  return <div className={`ac-annotation-layer ${tool === 'select' ? 'ac-select' : 'ac-draw'}`} aria-label={tool === 'select' ? 'Annotations' : `Draw ${tool} annotation`} onPointerDown={event => { if (tool === 'select') return; event.currentTarget.setPointerCapture(event.pointerId); origin.current = point(event); setDraft(origin.current) }} onPointerMove={event => { if (origin.current && tool === 'region') setDraft(rect(point(event))) }} onPointerUp={event => { if (!origin.current) return; const geometry: AnnotationGeometry = tool === 'region' ? rect(point(event)) : origin.current; if (tool !== 'region' || (geometry.width ?? 0) > .005) onCreate(geometry); origin.current = null; setDraft(null) }} onPointerCancel={() => { origin.current = null; setDraft(null) }}>
    {notes.map((note,index) => <button key={note.id} type="button" aria-label={`Annotation ${index+1}: ${note.body}`} title={note.body} className={`ac-note ${note.width ? 'ac-note-region' : 'ac-note-point'} ${note.status === 'resolved' ? 'ac-note-resolved' : ''}`} style={{ left: `${note.x*100}%`, top: `${note.y*100}%`, ...(note.width ? { width: `${note.width*100}%`, height: `${(note.height ?? 0)*100}%` } : {}) }} onPointerDown={e => e.stopPropagation()} onClick={() => onSelect?.(note)}><span>{index+1}</span></button>)}
    {draft && <span className="ac-note ac-note-region" style={{ left: `${draft.x*100}%`, top: `${draft.y*100}%`, width: `${(draft.width ?? .015)*100}%`, height: `${(draft.height ?? .015)*100}%`, pointerEvents: 'none' }} />}
  </div>
}
