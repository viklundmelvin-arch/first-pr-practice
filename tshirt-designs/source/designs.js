// Each design: 1000x1000 SVG body. Colors chosen per shirt.
const D = {};
const racket = (rot) => `
<g transform="rotate(${rot} 500 470)">
  <ellipse cx="500" cy="360" rx="62" ry="86" fill="none" stroke="C1" stroke-width="12"/>
  <g stroke="C1" stroke-width="3">
    ${[-45,-30,-15,0,15,30,45].map(x=>`<line x1="${500+x}" y1="${282+Math.abs(x)*0.9}" x2="${500+x}" y2="${438-Math.abs(x)*0.9}"/>`).join('')}
    ${[-60,-40,-20,0,20,40,60].map(y=>`<line x1="${500-Math.sqrt(1-(y/86)**2)*56}" y1="${360+y}" x2="${500+Math.sqrt(1-(y/86)**2)*56}" y2="${360+y}"/>`).join('')}
  </g>
  <path d="M478 440 L500 500 L522 440" fill="none" stroke="C1" stroke-width="10"/>
  <rect x="490" y="500" width="20" height="140" rx="6" fill="C1"/>
  <g stroke="C2" stroke-width="3">${[520,545,570,595,620].map(y=>`<line x1="490" y1="${y}" x2="510" y2="${y+12}"/>`).join('')}</g>
</g>`;

D.bastad = {name:"Båstad Tennis Society", shirt:"#f1ead9", svg:`
<text x="500" y="165" class="cinzel" font-size="118" font-weight="700" letter-spacing="22" text-anchor="middle" fill="#1f4a33">BÅSTAD</text>
<line x1="220" y1="205" x2="780" y2="205" stroke="#1f4a33" stroke-width="3"/>
${(racket(-32)+racket(32)).replace(/C1/g,'#1f4a33').replace(/C2/g,'#f1ead9')}
<circle cx="500" cy="585" r="34" fill="#c9b34a" stroke="#1f4a33" stroke-width="6"/>
<path d="M472 565 Q500 585 472 605 M528 565 Q500 585 528 605" stroke="#f1ead9" stroke-width="4" fill="none"/>
<text x="500" y="730" class="cinzel" font-size="56" font-weight="700" letter-spacing="14" text-anchor="middle" fill="#1f4a33">TENNIS SOCIETY</text>
<text x="500" y="820" class="pinyon" font-size="84" text-anchor="middle" fill="#8a2e2a">Est. 1930</text>
<text x="500" y="885" class="corm" font-size="26" font-weight="600" letter-spacing="9" text-anchor="middle" fill="#1f4a33">CENTRE COURT · SKÅNE · MEMBERS &amp; GUESTS</text>`};

D.pappas = {name:"Pappas båt, mina regler", shirt:"#ffffff", svg:`
<g fill="none" stroke="#14264a" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
  <path d="M130 470 L820 470 Q870 470 880 440 L860 430 L300 430 Q200 430 130 470 Z" fill="#14264a"/>
  <path d="M150 470 Q180 540 290 548 L760 548 Q840 540 870 470" />
  <path d="M170 490 Q210 530 290 532 L760 532 Q820 526 848 490" stroke-width="3"/>
  <path d="M470 430 L520 360 L640 360 L610 430" />
  <line x1="520" y1="360" x2="500" y2="430" stroke-width="4"/>
  <path d="M700 430 L700 395 L760 395" stroke-width="5"/>
  <line x1="860" y1="430" x2="920" y2="380" stroke-width="4"/>
  <path d="M920 380 L960 392 L920 404 Z" fill="#b3202a" stroke="#b3202a"/>
</g>
<g fill="none" stroke="#14264a" stroke-width="3" opacity=".7">
  <path d="M90 578 q30 -12 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0"/>
  <path d="M70 525 q40 20 90 30" /><path d="M60 550 q50 15 100 18"/>
</g>
<text x="500" y="230" class="play" font-size="150" font-weight="800" letter-spacing="6" text-anchor="middle" fill="#14264a">PAPPAS BÅT</text>
<text x="500" y="320" class="playi" font-size="80" text-anchor="middle" fill="#b3202a">mina regler.</text>
<text x="500" y="690" class="corm" font-size="30" font-weight="600" letter-spacing="10" text-anchor="middle" fill="#14264a">SANDHAMN · STOCKHOLMS SKÄRGÅRD</text>
<text x="500" y="745" class="corm" font-size="40" font-style="italic" font-weight="600" letter-spacing="2" text-anchor="middle" fill="#14264a">Mahogny, 34 knop, noll ansvar.</text>`};

const cray = (c)=>`
<g fill="${c}" stroke="${c}">
  <!-- tail segments -->
  ${[0,1,2,3,4].map(i=>`<ellipse cx="500" cy="${560+i*38}" rx="${58-i*6}" ry="24"/>`).join('')}
  <path d="M500 740 L440 800 Q500 790 560 800 Z"/><path d="M500 745 L470 812 L530 812 Z" />
  <!-- body -->
  <ellipse cx="500" cy="470" rx="70" ry="95"/>
  <path d="M470 380 L500 330 L530 380 Z"/>
  <!-- antennae -->
  <path d="M488 345 Q420 220 300 180" fill="none" stroke-width="5"/>
  <path d="M512 345 Q580 220 700 180" fill="none" stroke-width="5"/>
  <!-- legs -->
  ${[0,1,2,3].map(i=>`<path d="M${445} ${470+i*28} L${380-i*6} ${500+i*40} L${360-i*8} ${540+i*44}" fill="none" stroke-width="8" stroke-linecap="round"/><path d="M${555} ${470+i*28} L${620+i*6} ${500+i*40} L${640+i*8} ${540+i*44}" fill="none" stroke-width="8" stroke-linecap="round"/>`).join('')}
  <!-- arms + claws -->
  <path d="M450 410 Q380 380 360 320" fill="none" stroke-width="22" stroke-linecap="round"/>
  <path d="M550 410 Q620 380 640 320" fill="none" stroke-width="22" stroke-linecap="round"/>
  <path d="M360 330 Q300 300 300 220 Q330 170 370 180 Q345 240 385 290 Q400 250 420 230 Q430 300 360 330 Z"/>
  <path d="M640 330 Q700 300 700 220 Q670 170 630 180 Q655 240 615 290 Q600 250 580 230 Q570 300 640 330 Z"/>
</g>
<circle cx="480" cy="385" r="7" fill="#f1ead9"/><circle cx="520" cy="385" r="7" fill="#f1ead9"/>
${[0,1,2,3].map(i=>`<path d="M${452+i*3} ${560+i*38} Q500 ${572+i*38} ${548-i*3} ${560+i*38}" stroke="#f1ead9" stroke-width="3" fill="none" opacity=".7"/>`).join('')}`;
D.krafta = {name:"Kräftskiva Social Club", shirt:"#f1ead9", svg:`
<defs><path id="kt" d="M140 520 A360 360 0 0 1 860 520"/><path id="kb" d="M130 520 A370 370 0 0 0 870 520"/></defs>
<circle cx="500" cy="520" r="420" fill="none" stroke="#b3302a" stroke-width="8"/>
<circle cx="500" cy="520" r="300" fill="none" stroke="#b3302a" stroke-width="3"/>
<text class="cinzel" font-size="60" font-weight="700" letter-spacing="10" fill="#b3302a"><textPath href="#kt" startOffset="50%" text-anchor="middle">KRÄFTSKIVA SOCIAL CLUB</textPath></text>
<text class="cinzel" font-size="44" font-weight="700" letter-spacing="14" fill="#b3302a" dy="44"><textPath href="#kb" startOffset="50%" text-anchor="middle">★ SEDAN AUGUSTI ★</textPath></text>
<g transform="translate(500 525) scale(.66) translate(-500 -500)">${cray('#b3302a')}</g>
<text x="500" y="1000" class="pinyon" font-size="1" fill="none">.</text>`};

D.rowing = {name:"Djursholm Rowing Association", shirt:"#c9ccd1", svg:`
<defs><path id="ra" d="M110 420 Q500 120 890 420"/></defs>
<text class="grad" font-size="128" letter-spacing="6" fill="#13254a" stroke="#f4f1ea" stroke-width="0"><textPath href="#ra" startOffset="50%" text-anchor="middle">DJURSHOLM</textPath></text>
<g transform="rotate(-40 500 520)" fill="#13254a"><rect x="494" y="360" width="12" height="260" rx="6"/><path d="M486 600 Q474 670 500 700 Q526 670 514 600 Z"/><rect x="487" y="400" width="26" height="14" fill="#9d1c24"/></g>
<g transform="rotate(40 500 520)" fill="#13254a"><rect x="494" y="360" width="12" height="260" rx="6"/><path d="M486 600 Q474 670 500 700 Q526 670 514 600 Z"/><rect x="487" y="400" width="26" height="14" fill="#9d1c24"/></g>
<text x="500" y="610" class="grad" font-size="210" text-anchor="middle" fill="#9d1c24" stroke="#13254a" stroke-width="8" paint-order="stroke">D</text>
<text x="500" y="780" class="grad" font-size="92" letter-spacing="4" text-anchor="middle" fill="#13254a">ROWING ASSN.</text>
<text x="500" y="850" class="corm" font-size="34" font-weight="700" letter-spacing="12" text-anchor="middle" fill="#13254a">VARSITY VIII · EST. 1911</text>`};

D.torekov = {name:"Sommar i Torekov", shirt:"#fbfaf6", svg:`
<g stroke="#1d3b63" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="700" cy="250" r="55" stroke="#d98a2b"/>
  ${[0,1,2,3,4,5,6,7].map(i=>{const a=i*Math.PI/4;return `<line x1="${700+Math.cos(a)*72}" y1="${250+Math.sin(a)*72}" x2="${700+Math.cos(a)*92}" y2="${250+Math.sin(a)*92}" stroke="#d98a2b"/>`}).join('')}
  <path d="M300 420 L322 190 L358 190 L380 420 Z"/>
  <path d="M312 300 L368 300 M306 360 L374 360 M318 240 L362 240" stroke="#b3202a" stroke-width="16"/>
  <path d="M310 190 L370 190 L360 160 L320 160 Z"/><path d="M325 160 L340 130 L355 160"/>
  <path d="M240 420 Q300 400 440 420"/>
  <path d="M140 450 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0"/>
  <path d="M190 480 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" opacity=".6"/>
  <path d="M530 410 L600 330 L600 410 Z M608 345 L650 410 L608 410 Z" fill="#1d3b63"/>
</g>
<text x="500" y="700" class="allura" font-size="260" text-anchor="middle" fill="#1d3b63">Torekov</text>
<line x1="260" y1="760" x2="740" y2="760" stroke="#b3202a" stroke-width="3"/>
<text x="500" y="815" class="corm" font-size="32" font-weight="700" letter-spacing="12" text-anchor="middle" fill="#1d3b63">SOMMAREN · HALLANDSÅSEN · ’26</text>`};

// ICS signal flags
const flag = (L,x,y,s)=>{ const w=s,h=s;
 const r=(a,b,c,d,f)=>`<rect x="${x+a}" y="${y+b}" width="${c}" height="${d}" fill="${f}"/>`;
 let g='';
 if(L==='G'){for(let i=0;i<6;i++) g+=r(i*w/6,0,w/6+.5,h,i%2?'#1d4f9c':'#f2c318');}
 if(L==='R'){g+=r(0,0,w,h,'#c8242c')+r(w*.42,0,w*.16,h,'#f2c318')+r(0,h*.42,w,h*.16,'#f2c318');}
 if(L==='I'){g+=r(0,0,w,h,'#f2c318')+`<circle cx="${x+w/2}" cy="${y+h/2}" r="${w*.25}" fill="#111"/>`;}
 if(L==='S'){g+=r(0,0,w,h,'#ffffff')+r(w/3,h/3,w/3,h/3,'#1d4f9c');}
 if(L==='H'){g+=r(0,0,w/2,h,'#ffffff')+r(w/2,0,w/2,h,'#c8242c');}
 return g+`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#14264a" stroke-width="5"/>`+
   `<text x="${x+w/2}" y="${y+h+58}" class="cinzel" font-size="42" font-weight="700" text-anchor="middle" fill="#14264a">${L}</text>`;};
D.flags = {name:"Saltsjöbaden Regatta (signal flags spell GRISH)", shirt:"#ffffff", svg:`
<text x="500" y="200" class="corm" font-size="34" font-weight="700" letter-spacing="14" text-anchor="middle" fill="#14264a">INTERNATIONAL CODE OF SIGNALS</text>
<line x1="80" y1="290" x2="920" y2="290" stroke="#14264a" stroke-width="4"/>
${['G','R','I','S','H'].map((L,i)=>`<line x1="${150+i*175}" y1="290" x2="${150+i*175}" y2="320" stroke="#14264a" stroke-width="3"/>`+flag(L,90+i*175,320,120)).join('')}
<text x="500" y="640" class="cinzel" font-size="82" font-weight="700" letter-spacing="8" text-anchor="middle" fill="#14264a">SALTSJÖBADEN</text>
<text x="500" y="740" class="playi" font-size="74" text-anchor="middle" fill="#c8242c">Regatta Week</text>
<text x="500" y="820" class="corm" font-size="28" font-weight="700" letter-spacing="8" text-anchor="middle" fill="#14264a">MCMXXVI · FÖR SEGLARE, INTE MOTORBÅTAR</text>`};

D.verbier = {name:"Sportlov i Verbier", shirt:"#1b2a44", svg:`
<g stroke="#f1ead9" stroke-width="6" fill="none" stroke-linejoin="round">
  <path d="M120 470 L300 230 L380 330 L520 140 L700 390 L770 300 L880 470" />
  <path d="M255 290 L300 230 L340 280 L318 300 L300 285 L280 305 Z M470 205 L520 140 L570 210 L545 230 L520 212 L495 232 Z M745 332 L770 300 L800 340 L785 350 L770 338 L757 350 Z" fill="#f1ead9"/>
  <path d="M120 470 L880 470"/>
  <path d="M210 470 L300 380 L360 430 L440 360" opacity=".5"/>
</g>
<g transform="rotate(-9 500 540)"><rect x="330" y="532" width="340" height="14" rx="7" fill="#c8242c"/><path d="M670 532 Q700 532 704 515" stroke="#c8242c" stroke-width="11" fill="none" stroke-linecap="round"/></g>
<g transform="rotate(9 500 540)"><rect x="330" y="532" width="340" height="14" rx="7" fill="#c8242c"/><path d="M330 532 Q300 532 296 515" stroke="#c8242c" stroke-width="11" fill="none" stroke-linecap="round"/></g>
<text x="500" y="720" class="cinzel" font-size="120" font-weight="700" letter-spacing="14" text-anchor="middle" fill="#f1ead9">SPORTLOV</text>
<text x="500" y="820" class="pinyon" font-size="96" text-anchor="middle" fill="#d9b35a">i Verbier</text>
<text x="500" y="890" class="corm" font-size="28" font-weight="600" letter-spacing="10" text-anchor="middle" fill="#f1ead9">ÅRE ÄR FÖR TURISTER</text>`};

D.studenten = {name:"Studenten — Inget flak", shirt:"#ffffff", svg:`
<g stroke="#111" stroke-width="6" stroke-linejoin="round">
  <path d="M300 330 Q300 200 500 190 Q700 200 700 330 Z" fill="#fff"/>
  <path d="M300 330 L700 330 L700 390 L300 390 Z" fill="#111"/>
  <path d="M320 390 Q500 470 690 390 Q560 420 320 390 Z" fill="#111"/>
  <circle cx="500" cy="300" r="26" fill="#d4a93a"/>
  <path d="M500 280 L506 294 L520 296 L509 306 L512 320 L500 312 L488 320 L491 306 L480 296 L494 294 Z" fill="#1d4f9c" stroke="none"/>
  <path d="M345 290 Q420 240 500 238" fill="none" stroke-width="3" opacity=".4"/>
</g>
<text x="500" y="620" class="frak" font-size="170" text-anchor="middle" fill="#111">Studenten</text>
<text x="500" y="700" class="corm" font-size="40" font-weight="700" letter-spacing="16" text-anchor="middle" fill="#111">OLD MONEY · CLASS OF ’27</text>
<line x1="330" y1="740" x2="670" y2="740" stroke="#111" stroke-width="2"/>
<text x="500" y="810" class="playi" font-size="52" text-anchor="middle" fill="#1d4f9c">Inget flak. Vi tar segelbåten.</text>`};

if (typeof module!=='undefined') module.exports=D;
