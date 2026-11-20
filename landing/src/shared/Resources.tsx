import { resources } from '../copy';
export function Resources({ title, note }: { title: string; note?: string }) {
  return <section className="resources shell" aria-labelledby="recursos"><div className="resources-heading"><span className="eyebrow">O núcleo da plataforma</span><h2 id="recursos">{title}</h2>{note && <p>{note}</p>}</div><ul className="resource-list">{resources.map(item => <li key={item.title}><span aria-hidden="true">↗</span><div><h3>{item.title}</h3><p>{item.text}</p></div></li>)}</ul></section>;
}
