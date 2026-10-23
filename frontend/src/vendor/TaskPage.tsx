import type { ReactNode } from "react";
/** Same editor fields as a task dialog, presented as a routable document. */
export function TaskPage({opened,title,children,footer}:{opened:boolean;title:string;description?:string;children:ReactNode;footer:ReactNode;onClose:()=>void;busy?:boolean;eyebrow?:string;headingEyebrow?:string}){
 if(!opened)return null;
 return <section className="location-editor-page" aria-label={title}><div className="location-editor-content">{children}</div><footer className="location-editor-footer">{footer}</footer></section>;
}
