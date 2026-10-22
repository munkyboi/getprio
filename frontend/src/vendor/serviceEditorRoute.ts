export { resolveLocationEditor as resolveServiceEditor } from "./locationEditorRoute";
export function serviceEditorPath(slug:string,search:string) {
  return `/dashboard/services/${encodeURIComponent(slug)}/edit${search}`;
}
