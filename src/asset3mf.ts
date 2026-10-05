import type { BufferGeometry } from 'three';
import { plaqueMaterials, type AssetOptions } from './assetGeometry';
const encode = (s:string)=>new TextEncoder().encode(s);
const xml = (s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
function meshXML(g:BufferGeometry,colourIndex:number) {
  const flat=g.index?g.toNonIndexed():g,p=flat.getAttribute('position');
  const vertices:string[]=[],triangles:string[]=[];
  // Weld vertices so each material volume has a closed indexed topology.
  const indices:number[]=[],seen=new Map<string,number>();
  for(let i=0;i<p.count;i++) {
    const v=[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Number(n.toFixed(5))),key=v.join(',');
    let id=seen.get(key);if(id===undefined){id=vertices.length;seen.set(key,id);vertices.push(`<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`);}indices.push(id);
  }
  for(let i=0;i<indices.length;i+=3) triangles.push(`<triangle v1="${indices[i]}" v2="${indices[i+1]}" v3="${indices[i+2]}" pid="2" p1="${colourIndex}"/>`);
  if(flat!==g)flat.dispose();
  return `<mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh>`;
}
function crc32(bytes:Uint8Array) {let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
/** Standard ZIP store method: a portable 3MF without printer profiles. */
function zip(files:Record<string,string>) {
  const chunks:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0;
  for(const [name,content] of Object.entries(files)) {
    const filename=encode(name),data=encode(content),crc=crc32(data);
    const header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,filename.length,true);header.set(filename,30);
    const central=new Uint8Array(46+filename.length),c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);central.set(filename,46);
    chunks.push(header,data);directory.push(central);offset+=header.length+data.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer),length=directory.reduce((s,c)=>s+c.length,0);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,directory.length,true);e.setUint16(10,directory.length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end] as BlobPart[],{type:'model/3mf'});
}
export function plaque3MF(o:AssetOptions) {
  const parts=plaqueMaterials(o);
  const materials=parts.map(p=>`<base name="${xml(p.name)}" displaycolor="${p.colour.toUpperCase()}FF"/>`).join('');
  const objects=parts.map((p,i)=>`<object id="${i+3}" type="model" name="${xml(p.name)}" pid="1" pindex="${i}">${meshXML(p.geometry,i)}</object>`).join('');
  const config=`<?xml version="1.0" encoding="UTF-8"?><config><object id="5"><metadata key="name" value="Custom plaque"/><metadata key="extruder" value="1"/>${parts.map((p,i)=>`<part id="${i+3}" subtype="normal_part"><metadata key="name" value="${xml(p.name)}"/><metadata key="extruder" value="${i+1}"/></part>`).join('')}</object></config>`;
  parts.forEach(p=>p.geometry.dispose());
  return zip({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/3dmodel.model':`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-GB" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><metadata name="Application">Contour Studio</metadata><resources><basematerials id="1">${materials}</basematerials><m:colorgroup id="2">${parts.map(p=>`<m:color color="${p.colour.toUpperCase()}FF"/>`).join('')}</m:colorgroup>${objects}<object id="5" type="model" name="Custom plaque"><components><component objectid="3"/><component objectid="4"/></components></object></resources><build><item objectid="5"/></build></model>`,
    'Metadata/model_settings.config':config,
  });
}
