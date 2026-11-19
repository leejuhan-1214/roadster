import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Marked,Renderer} from 'marked';

const docs=fileURLToPath(new URL('../docs/',import.meta.url));
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const reports=new Map([
  ['landing-study-guide.md','landing-study-guide.html'],
  ['experiment-mass-basis.md','guide/experiment-mass-basis.html'],
  ['landing-20m-v146.md','guide/landing-20m-v146.html']
]);
const relativeURL=(from,to)=>path.relative(from,to).split(path.sep).join('/');
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

for(const [source,destination] of reports){
  const output=path.join(dist,destination),here=path.dirname(output);
  mkdirSync(here,{recursive:true});
  const titleAndSections=[],renderer=new Renderer();
  let currentSection='',tableNumber=0;

  renderer.heading=function(token){
    const label=this.parser.parseInline(token.tokens);
    if(token.depth===1){titleAndSections.push({title:token.text});return '<h1>'+label+'</h1>\n';}
    if(token.depth===2){
      currentSection=token.text.startsWith('8. 20 m 부양 후 제동 시작 높이 실험')?'height-study':'section-'+titleAndSections.length;
      titleAndSections.push({id:currentSection,title:token.text});
      tableNumber=0;
      return '<h2 id="'+currentSection+'">'+label+'</h2>\n';
    }
    return Renderer.prototype.heading.call(this,token);
  };
  renderer.table=function(token){
    const table=Renderer.prototype.table.call(this,token).replace(/<th(?=[ >])/g,'<th scope="col"');
    const label=titleAndSections.at(-1).title+' 표 '+(++tableNumber);
    return '<div class="data-table" role="region" aria-label="'+escape(label)+'" tabindex="0">'+table+'</div>\n';
  };
  renderer.link=function(token){
    const url=token.href;
    if(url.startsWith('#')||/^https?:\/\//i.test(url))return Renderer.prototype.link.call(this,token);
    const [pathname,fragment]=url.split('#'),target=path.resolve(docs,pathname);
    if(!existsSync(target))throw Error(source+' points to a missing file: '+url);
    const relativeDoc=relativeURL(docs,target),published=reports.get(relativeDoc);
    let asset;
    if(published)asset=path.join(dist,published);
    else if(!path.relative(dist,target).startsWith('..'))asset=target;
    else if(!relativeDoc.startsWith('..')&&/\.(?:csv|json|txt)$/i.test(relativeDoc)){
      asset=relativeDoc.startsWith('data/')?path.join(dist,relativeDoc):path.join(dist,'guide',relativeDoc);
      mkdirSync(path.dirname(asset),{recursive:true});
      copyFileSync(target,asset);
    }else throw Error('Add a public destination for '+url+' in '+source);
    return Renderer.prototype.link.call(this,{...token,href:relativeURL(here,asset)+(fragment?'#'+fragment:'')});
  };
  const md=readFileSync(path.join(docs,source),'utf8');
  const body=new Marked({gfm:true,renderer}).parse(md);
  const [heading,...sections]=titleAndSections;
  const toc=sections.map(section=>'<li><a href="#'+section.id+'">'+escape(section.title)+'</a></li>').join('\n');
  const toRoot=relativeURL(here,dist)||'.';
  const guideLink=source==='landing-study-guide.md'?'':'<a href="'+toRoot+'/landing-study-guide.html">보고서 가이드로</a>';
  const html=`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(heading.title)}</title>
  <link rel="stylesheet" href="${toRoot}/landing-study-guide.css">
</head>
<body>
  <a class="skip" href="#report">본문 바로가기</a>
  <header><div class="bar"><a class="brand" href="${toRoot}/">Roadster 착지 실험</a>${guideLink}</div></header>
  <div class="layout">
    <nav aria-labelledby="contents-title"><h2 id="contents-title">목차</h2><ul>${toc}</ul></nav>
    <main id="report" tabindex="-1">${body}</main>
  </div>
</body>
</html>
`;
  writeFileSync(output,html);
}
