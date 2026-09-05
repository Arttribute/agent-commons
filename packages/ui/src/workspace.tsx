'use client'

import { forwardRef, useEffect, useRef, useState, type HTMLAttributes, type TextareaHTMLAttributes, type ReactNode, type PointerEvent } from 'react'

/** Shared surface: hosts retain their own streaming, uploads and agent routing. */
export const ComposerSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ComposerSurface({className='', ...props}, ref) {
  return <div ref={ref} className={`ac-composer ${className}`} {...props}/>
})
export const ComposerTextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function ComposerTextArea({className='', ...props}, ref) {
  return <textarea ref={ref} className={`ac-composer-input ${className}`} {...props}/>
})
export type ComposerAttachment = {id:string;name:string;status?:'uploading'|'ready'|'error';url?:string;type?:string}
export function ChatComposer({value,onChange,onSubmit,disabled,busy,placeholder='What would you like to create?',agents=[],agentId,onAgentChange,models=[],modelId,onModelChange,attachments=[],onFiles,onRemoveAttachment,context,footer}: {
  value:string;onChange:(value:string)=>void;onSubmit:()=>void;disabled?:boolean;busy?:boolean;placeholder?:string;
  agents?:readonly {id:string;name:string}[];agentId?:string;onAgentChange?:(id:string)=>void;
  models?:readonly {id:string;name:string}[];modelId?:string;onModelChange?:(id:string)=>void;
  attachments?:readonly ComposerAttachment[];onFiles?:(files:File[])=>void;onRemoveAttachment?:(id:string)=>void;context?:ReactNode;footer?:ReactNode
}) {
  const input=useRef<HTMLInputElement>(null)
  return <ComposerSurface onDragOver={e=>{if(onFiles)e.preventDefault()}} onDrop={e=>{if(onFiles){e.preventDefault();onFiles(Array.from(e.dataTransfer.files))}}}>
    {context&&<div className="ac-composer-context">{context}</div>}
    {!!attachments.length&&<div className="ac-composer-attachments">{attachments.map(a=><span key={a.id} className={`ac-context-chip ${a.status==='error'?'ac-context-error':''}`}>{a.status==='uploading'?'Uploading · ':''}{a.name}{onRemoveAttachment&&<button type="button" title={`Remove ${a.name}`} aria-label={`Remove ${a.name}`} onClick={()=>onRemoveAttachment(a.id)}>×</button>}</span>)}</div>}
    <ComposerTextArea aria-label="Message your agent" placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled||busy} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(value.trim()&&!disabled&&!busy)onSubmit()}}}/>
    <div className="ac-composer-controls">
      {onFiles&&<><input ref={input} type="file" multiple hidden onChange={e=>{if(e.target.files)onFiles(Array.from(e.target.files));e.target.value=''}}/><button type="button" className="ac-tool-button" aria-label="Add files and media" title="Add files and media" disabled={disabled||busy} onClick={()=>input.current?.click()}>＋</button></>}
      {onAgentChange&&<select aria-label="Agent" value={agentId??''} onChange={e=>onAgentChange(e.target.value)} disabled={disabled||busy}>{agents.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select>}
      {onModelChange&&<select aria-label="Model" value={modelId??''} onChange={e=>onModelChange(e.target.value)} disabled={disabled||busy}>{models.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select>}
      <span className="ac-composer-spacer"/>{footer}<button type="button" className="ac-composer-send" aria-label={busy?'Agent is working':'Send message'} title={busy?'Agent is working':'Send message'} disabled={disabled||busy||!value.trim()||attachments.some(a=>a.status==='uploading')} onClick={onSubmit}>{busy?'· · ·':'↑'}</button>
    </div>
  </ComposerSurface>
}

export function CanvasToolButton({label,active,onClick,disabled,children}:{label:string;active?:boolean;onClick:()=>void;disabled?:boolean;children:ReactNode}) {
  return <button type="button" className={`ac-tool-button ${active?'ac-tool-active':''}`} aria-label={label} aria-pressed={active} title={label} data-tooltip={label} disabled={disabled} onClick={onClick}>{children}</button>
}

export function ResizablePanel({side,defaultWidth=300,minWidth=200,maxWidth=650,label,children,className=''}:{side:'left'|'right';defaultWidth?:number;minWidth?:number;maxWidth?:number;label:string;children:ReactNode;className?:string}) {
  const [width,setWidth]=useState(defaultWidth)
  const drag=useRef<{x:number;width:number}|null>(null)
  const resize=(next:number)=>setWidth(Math.max(minWidth,Math.min(maxWidth,window.innerWidth*.6,next)))
  function move(event:PointerEvent<HTMLDivElement>){if(drag.current)resize(drag.current.width+(event.clientX-drag.current.x)*(side==='left'?1:-1))}
  return <aside className={`ac-resizable-panel ac-resizable-${side} ${className}`} style={{width}} aria-label={label}><div className="ac-panel-content">{children}</div><div className="ac-panel-resize" role="separator" aria-label={`Resize ${label}`} aria-orientation="vertical" aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={Math.round(width)} tabIndex={0} onPointerDown={event=>{event.preventDefault();drag.current={x:event.clientX,width};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onDoubleClick={()=>setWidth(defaultWidth)} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resize(width+(event.key==='ArrowRight'?20:-20)*(side==='left'?1:-1))}}}/></aside>
}

export type SourceFile = {path:string;content:string;mimeType?:string}
export function CodeFileBrowser({files,onChange,empty='No source files yet. Describe what you want to build to get started.'}:{files:readonly SourceFile[];onChange?:(path:string,content:string)=>void;empty?:string}) {
  const [selected,setSelected]=useState(files[0]?.path??'')
  useEffect(()=>{if(!files.some(file=>file.path===selected))setSelected(files[0]?.path??'')},[files,selected])
  const active=files.find(file=>file.path===selected)
  if(!active)return <div className="ac-source-empty">{empty}</div>
  return <div className="ac-source-browser"><nav aria-label="Project files" className="ac-source-tree"><span className="ac-source-heading">Files</span>{files.map(file=><button type="button" key={file.path} className={selected===file.path?'ac-source-selected':''} title={file.path} onClick={()=>setSelected(file.path)}><span aria-hidden="true">⌘</span>{file.path}</button>)}</nav><div className="ac-source-editor"><div className="ac-source-filebar">{active.path}<span>{onChange?'Editable source':'Source'}</span></div><textarea spellCheck={false} aria-label={`Source: ${active.path}`} value={active.content} readOnly={!onChange} onChange={event=>onChange?.(active.path,event.target.value)} onKeyDown={event=>{if(event.key==='Tab'&&onChange){event.preventDefault();const input=event.currentTarget;const start=input.selectionStart;onChange(active.path,active.content.slice(0,start)+'  '+active.content.slice(input.selectionEnd));requestAnimationFrame(()=>input.setSelectionRange(start+2,start+2))}}}/></div></div>
}
