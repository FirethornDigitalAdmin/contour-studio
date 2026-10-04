import { ArrowRight, Grid2X2, Hexagon, Map, Plus, Puzzle, RotateCcw, Printer, Search, LoaderCircle, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { projectNames, projectType, projectLabel, type ProjectType, type SavedDesign, type WallContent, type DeletedProject } from './projectWorkflow';

const examplePlaces = { single: 'Keswick', modular: 'Bolton upon Dearne', jigsaw: 'Keswick', places: 'Keswick & Bolton upon Dearne' };
const exampleDescriptions = { single: 'A framed Keswick terrain model with green land, blue water and pale roads and buildings', modular: 'Bolton upon Dearne map inserts in independent keyed holders', jigsaw: 'A coloured Keswick map cut into sixteen interlocking pieces, with one piece lifted out', places: 'Separate Bolton upon Dearne and Keswick map inserts in independent hexagonal holders' };
function ProjectExample({ type, places = false }: { type: ProjectType; places?: boolean }) {
  const example = type === 'modular' && places ? 'places' : type;
  return <span className="project-model-example"><img src={`./project-examples/${example}.webp`} width="960" height="700" alt={exampleDescriptions[example]} decoding="async" /><span className="project-model-caption">{examplePlaces[example]} · generated model</span></span>;
}
export function ProjectChooser({ onChoose, current, initialContent = 'continuous', initialShape = 'mini_tiles', onCancel }: { onChoose: (type: ProjectType, content: WallContent, shape: 'mini_tiles' | 'hexagons') => void; current?: ProjectType; initialContent?: WallContent; initialShape?: 'mini_tiles' | 'hexagons'; onCancel: () => void }) {
  const [choice, setChoice] = useState<ProjectType | null>(current ?? null);
  const [content, setContent] = useState<WallContent>(initialContent);
  const [shape,setShape]=useState<'mini_tiles'|'hexagons'>(initialShape);
  const journeys=[{type:'single' as const,label:'Single map',text:'One place, made into your own artwork.'},{type:'modular' as const,content:'continuous' as const,label:'Continuous tiled map',text:'One place across swappable tiles. Extend the map over time.'},{type:'modular' as const,content:'places' as const,label:'Collection of places',text:'A different place on each swappable tile. Add places over time.'},{type:'jigsaw' as const,label:'Jigsaw puzzle',text:'Your favourite place, piece by piece.'}];
  return <>
    <div className="project-type-cards" role="group" aria-label="Project type">
      {journeys.map(journey=><button type="button" key={journey.label} aria-label={journey.label} aria-pressed={choice===journey.type&&(!journey.content||content===journey.content)} onClick={()=>{setChoice(journey.type);if(journey.content)setContent(journey.content);}}><ProjectExample type={journey.type} places={journey.content==='places'}/><strong>{journey.label}</strong><small>{journey.text}</small></button>)}
    </div>
    {choice==='modular'&&<div className="wall-content-choice"><h3>Choose your tile shape</h3><div className="segmented" role="group" aria-label="Tile shape"><button type="button" aria-pressed={shape==='mini_tiles'} onClick={()=>setShape('mini_tiles')}><Grid2X2 size={17}/>Square</button><button type="button" aria-pressed={shape==='hexagons'} onClick={()=>setShape('hexagons')}><Hexagon size={17}/>Hexagonal</button></div><p className="hint">Start with one tile and its removable holder. Reopen the saved project to add one adjoining tile at a time. Each holder joins to the next with removable rear keys.</p></div>}
    {current&&<p className="hint">Your authored design stays editable. Changing the journey or tile shape changes its layout; Undo restores it.</p>}
    <div className="project-chooser-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!choice} onClick={()=>choice&&onChoose(choice,content,shape)}>{current?'Apply project type':'Create project'}<ArrowRight size={17}/></button></div>
  </>;
}
export type GeneratedProject = { id: string; name: string; created_at: string; layout: { columns: number; rows: number }; width?: number; height?: number; terrain_style?: string; project_id?: string };
export default function ProjectStart({ deletedProjects, onDelete, onRestore, designs, projects, loading, error, hasDraft, onNew, onResume, onOpenDesign, onOpenProject, onRefresh, onImport, busy }: {
  deletedProjects: DeletedProject[]; onDelete: (id: string, jobId?: string, filesOnly?: boolean) => Promise<void>; onRestore: (item: DeletedProject) => Promise<void>;
  designs: SavedDesign[]; projects: GeneratedProject[]; loading: boolean; error: string; hasDraft: boolean; busy: boolean;
  onNew: () => void; onResume: () => void; onOpenDesign: (design: SavedDesign, print?: boolean) => void; onOpenProject: (id: string, print?: boolean) => void; onRefresh: () => void; onImport: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; jobId?: string } | null>(null);
  const deletionDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (pendingDelete && deletionDialog.current && !deletionDialog.current.open) deletionDialog.current.showModal(); }, [pendingDelete]);
  const [managing, setManaging] = useState(false);
  const [managementError, setManagementError] = useState("");
  async function remove(filesOnly: boolean) {
    if (!pendingDelete || managing) return;
    setManaging(true); setManagementError("");
    try { await onDelete(pendingDelete.id, pendingDelete.jobId, filesOnly); setPendingDelete(null); }
    catch (error) { setManagementError((error as Error).message); }
    finally { setManaging(false); }
  }
  async function restore(item: DeletedProject) {
    setManaging(true); setManagementError("");
    try { await onRestore(item); } catch (error) { setManagementError((error as Error).message); } finally { setManaging(false); }
  }
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const generatedIds = new Set(projects.map(project => project.id));
  // The latest editable design represents each generated artwork in the library.
  const seenJobs = new Set<string>();
  const entries: { id: string; name: string; updated: string; design?: SavedDesign; project?: GeneratedProject; generated: boolean }[] = [...designs].sort((a, b) => b.updated.localeCompare(a.updated)).filter(design => {
    if (!design.jobId) return true;
    if (seenJobs.has(design.jobId)) return false;
    seenJobs.add(design.jobId); return true;
  }).map(design => ({ id: design.id, name: design.settings.project_name || design.settings.name, updated: design.updated, design, project: undefined, generated: !!design.jobId && generatedIds.has(design.jobId) }));
  const seenDesigns=new Set(designs.map(design=>design.id));
  for (const project of projects) if (!seenJobs.has(project.id)&&(!project.project_id||!seenDesigns.has(project.project_id))) { if(project.project_id)seenDesigns.add(project.project_id); entries.push({ id: project.id, name: project.name, updated: project.created_at, design: undefined, project, generated: true }); }
  const filtered = entries.filter(entry => entry.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? a.updated.localeCompare(b.updated) : b.updated.localeCompare(a.updated));
  return <main className="project-start" id="workspace">
    <div className="start-intro"><span className="eyebrow">FREE & OPEN SOURCE · MADE FOR MAKERS</span><h1>A place worth making.</h1><p>Choose a place. Make it yours. Prepare every piece for printing.</p><div className="start-actions"><button className="primary" disabled={busy || managing} onClick={onNew}><Plus size={19} />New project</button>{hasDraft && <button disabled={busy || managing} onClick={onResume}><RotateCcw size={17} />Continue last project</button>}</div></div>
    <div className="start-project-examples" role="group" aria-label="Examples rendered from real generated models">{(['single', 'modular', 'jigsaw'] as const).map(type => <div key={type}><ProjectExample type={type}/><span>{projectNames[type]}</span></div>)}</div>
    <section className="recent-designs" aria-labelledby="recent-designs-title"><div className="recent-designs-heading"><div><h2 id="recent-designs-title">Your projects</h2><p>Designs and print files together. Saved on this device.</p></div><div><button disabled={busy || managing} onClick={onImport}>Import design</button><button disabled={loading || busy} onClick={onRefresh}>Refresh</button></div></div>
      <div className="project-library-tools"><label className="library-search"><Search size={17}/><input aria-label="Search projects" placeholder="Find a project…" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Sort projects" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></div>
      {loading && <p role="status"><LoaderCircle size={16} className="spin"/>Refreshing projects…</p>}
      {error && <div className="inline-error" role="alert"><p>{error}</p><button disabled={loading} onClick={onRefresh}>Try again</button></div>}
      {filtered.length ? <div className="recent-design-grid">{filtered.map(entry => <article className="library-project" key={entry.id}>
        <button className="recent-design" disabled={busy || managing} onClick={() => entry.design ? onOpenDesign(entry.design) : onOpenProject(entry.id)}><span className="recent-design-art"><Map size={28} aria-hidden="true"/></span><span><strong>{entry.name}</strong><small>{entry.design ? `${projectLabel(entry.design.settings)} · ${Number(entry.design.settings.width.toFixed(1))} × ${Number(entry.design.settings.height.toFixed(1))} mm` : `${entry.project!.layout.columns * entry.project!.layout.rows} tiles`}</small><small>{new Date(entry.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {entry.generated ? 'Print files available' : 'Design saved'}</small></span><ArrowRight size={17}/></button>
        {entry.generated && <button className="library-print" disabled={busy || managing} aria-label={`Print files for ${entry.name}`} onClick={() => entry.design ? onOpenDesign(entry.design, true) : onOpenProject(entry.id, true)}><Printer size={16}/>Print files</button>}
        <button className="library-delete" disabled={busy || managing} aria-label={`Delete ${entry.name}`} onClick={() => { setManagementError(""); setPendingDelete({ id: entry.id, name: entry.name, jobId: entry.generated ? (entry.design?.jobId || entry.project?.id) : undefined }); }}><Trash2 size={16}/>Delete</button>
      </article>)}</div> : <div className="start-empty"><Puzzle size={23}/><p>{query ? 'No projects match your search.' : 'Your first project starts with a place that means something to you.'}</p>{query && <button onClick={() => setQuery('')}>Clear search</button>}</div>}
      {managementError && <p className="inline-error" role="alert">{managementError}</p>}
      {!!deletedProjects.length && <details className="library-trash"><summary><Trash2 size={16}/>Deleted projects & print files · {deletedProjects.length}</summary><p>Deleted items stay on this device until you restore them.</p>{[...deletedProjects].reverse().map(item => <div key={item.id}><span><strong>{item.name}</strong> · {item.filesOnly ? 'Print files' : 'Project'}</span><button disabled={busy || managing} onClick={() => void restore(item)}><RotateCcw size={15}/>Restore</button></div>)}</details>}
      {pendingDelete && <dialog ref={deletionDialog} onCancel={event => { if (managing) event.preventDefault(); else setPendingDelete(null); }} aria-labelledby="delete-project-title" className="library-delete-dialog"><div className="panel-heading"><h2 id="delete-project-title">Delete {pendingDelete.name}?</h2><button disabled={managing} aria-label="Cancel deletion" onClick={() => setPendingDelete(null)}><X size={20}/></button></div><p>Delete the project and its generated files, or clear the print files while keeping the editable design. You can restore deleted items from the Projects library.</p>{managementError && <p role="alert">{managementError}</p>}<div className="project-chooser-actions"><button disabled={managing} onClick={() => setPendingDelete(null)}>Cancel</button>{pendingDelete.jobId && <button disabled={managing} onClick={() => void remove(true)}>Delete print files only</button>}<button className="primary" disabled={managing} onClick={() => void remove(false)}>{managing ? 'Deleting…' : 'Delete project'}</button></div></dialog>}
    </section>
  </main>;
}
