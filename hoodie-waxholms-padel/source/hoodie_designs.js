// Padel racket, vertical, 1000-wide coordinate space. ink = print colour, bg = garment colour (holes/details).
const HEAD="M500 250 C655 250 720 345 720 480 C720 600 660 690 575 740 L545 800 L455 800 L425 740 C340 690 280 600 280 480 C280 345 345 250 500 250 Z";
const INNER="M500 286 C632 286 684 365 684 480 C684 585 634 663 560 705 L440 705 C366 663 316 585 316 480 C316 365 368 286 500 286 Z";
const racket=(c,g,id)=>{
  let holes='';
  for(let r=0;r<14;r++)for(let q=0;q<12;q++){const x=318+q*34+(r%2?17:0),y=330+r*28;const dx=(x-500)/160,dy=(y-485)/190;if(dx*dx+dy*dy<1)holes+=`<circle cx="${x}" cy="${y}" r="8"/>`;}
  return `<defs><clipPath id="in${id}"><path d="${INNER}"/></clipPath></defs>
  <path d="${HEAD}" fill="${c}"/>
  <path d="${INNER}" fill="none" stroke="${g}" stroke-width="3"/>
  <g clip-path="url(#in${id})" fill="${g}">${holes}</g>
  <path d="M474 760 L500 722 L526 760 Z" fill="${g}"/>
  <rect x="468" y="796" width="64" height="215" rx="12" fill="${c}"/>
  <g stroke="${g}" stroke-width="3">${[0,1,2,3,4,5,6].map(i=>`<line x1="468" y1="${822+i*26}" x2="532" y2="${838+i*26}"/>`).join('')}</g>
  <rect x="460" y="1005" width="80" height="26" rx="10" fill="${c}"/>
  <path d="M486 1031 C462 1110 538 1110 514 1031" fill="none" stroke="${c}" stroke-width="6"/>`;};
const ball=(c,g,x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>
  <path d="M${x-r*0.8} ${y-r*0.55} Q${x} ${y} ${x-r*0.8} ${y+r*0.55} M${x+r*0.8} ${y-r*0.55} Q${x} ${y} ${x+r*0.8} ${y+r*0.55}" stroke="${g}" stroke-width="${r*0.13}" fill="none"/>`;
const HD={};
HD.back=(ink,acc,bg)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1420" width="1000" height="1420">
<text x="500" y="130" class="cinzel" font-size="112" font-weight="700" letter-spacing="26" text-anchor="middle" fill="${ink}">WAXHOLMS</text>
<text x="500" y="200" class="corm" font-size="40" font-weight="600" letter-spacing="19" text-anchor="middle" fill="${ink}">PADELSÄLLSKAP</text>
${racket(ink,bg,'b')}
${ball(acc,bg,665,960,44)}
<text x="500" y="1170" class="pinyon" font-size="84" text-anchor="middle" fill="${acc}">Est. 2019</text>
<text x="500" y="1240" class="corm" font-size="30" font-weight="600" letter-spacing="12" text-anchor="middle" fill="${ink}">59°24′N · 18°21′E</text>
</svg>`;
HD.chest=(ink,acc,bg)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<g transform="translate(200 165) rotate(-18) scale(0.27) translate(-500 -640)">${racket(ink,bg,'c')}</g>
${ball(acc,bg,262,250,18)}
<text x="200" y="365" class="cinzel" font-size="42" font-weight="700" letter-spacing="10" text-anchor="middle" fill="${ink}">W.P.S.</text>
</svg>`;
if(typeof module!=='undefined')module.exports=HD;
