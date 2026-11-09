/* Stock Cevilog : stock réel et labo / démo avec dépréciation en %, attente livraison client.
   Données dans Supabase (tables stk_*), accès par invitation, rôles admin / membre / lecteur. */
(function(){
"use strict";
var SB_URL="https://bqnfsvvaajgrurfozfkv.supabase.co";
var SB_KEY="sb_publishable_oepIKCobZddYfW4d2kKMvg_ZFFCX0bo";
var sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"stock-auth"}});
var CATS=["Caméra","Caméra 3D","Lecteur de codes","Objectif","Éclairage","Filtre / optique","Câble","Interface E/S","Informatique","Accessoire","Projet"];
var NOAM=["Objectif","Filtre / optique"];
var LOC={stock:"Stock réel",labo:"Labo / démo",attente:"Attente livraison"};
var LOCS={stock:"Stock",labo:"Labo",attente:"Attente"};
var $=function(id){return document.getElementById(id);};
var me=null, org=null, role=null, ready=false, writable=true;
var items=[], moves=[], cfg={pct:30,pctStock:0};
var S={tab:"stock",q:"",cat:"",empty:false,unchk:false,sort:"ref",dir:1};
try{ var p=JSON.parse(localStorage.getItem("cevilog-stock-ui")||"null"); if(p){ S.tab=p.tab||S.tab; S.empty=!!p.empty; } }catch(e){}
function keep(){ try{ localStorage.setItem("cevilog-stock-ui",JSON.stringify({tab:S.tab,empty:S.empty})); }catch(e){} }

function today(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function esc(t){ return String(t==null?"":t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
var EUR=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
var NUM=new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2});
function eur(n){ return EUR.format(Math.round((n||0)*100)/100); }
function neg(n){ return n?"−"+eur(Math.abs(n)):eur(0); }
function fd(d){ if(!d) return "—"; var p=d.split("-"); return p[2]+"/"+p[1]+"/"+p[0]; }
function num(v){ var n=parseFloat(String(v).replace(/\s/g,"").replace(",",".")); return isFinite(n)?n:0; }
function addYears(d,y){ var t=new Date(d+"T00:00:00"); t.setMonth(t.getMonth()+Math.round(y*12)); return t; }
function isAm(i){ return i.amort!=null?!!i.amort:NOAM.indexOf(i.cat)<0; }

/* ---------- dépréciation : un taux en % appliqué au prix d'achat ---------- */
function defPct(loc){ return loc==="labo"?cfg.pct:cfg.pctStock; }
function pctOf(i){ return isAm(i)?Math.max(0,Math.min(100,i.pct!=null?+i.pct:defPct(i.loc))):0; }
function dep(it){
  var cost=(it.qty||0)*(it.pu||0);
  if(it.loc==="attente") return {cost:cost,cum:0,vnc:cost,pct:0};
  var p=pctOf(it), cum=Math.round(cost*p)/100;
  return {cost:cost,cum:cum,vnc:cost-cum,pct:p};
}
function unitVnc(it){ return dep(Object.assign({},it,{qty:1})).vnc; }

/* ---------- synthèse ---------- */
function renderSum(){
  var sc=0,sv=0,lc=0,lv=0,av=0,n={stock:0,labo:0,attente:0},late=0,t=today();
  items.forEach(function(i){
    if(i.qty>0) n[i.loc]=(n[i.loc]||0)+1;
    var d=dep(i);
    if(i.loc==="stock"){ sc+=d.cost; sv+=d.vnc; }
    else if(i.loc==="labo"){ lc+=d.cost; lv+=d.vnc; }
    else { av+=d.cost; if(i.qty>0&&i.eta&&i.eta<t) late++; }
  });
  function pc(c,v){ return c?NUM.format(Math.round((c-v)/c*1000)/10)+' %':'0 %'; }
  $("n-stock").textContent=n.stock; $("n-labo").textContent=n.labo; $("n-attente").textContent=n.attente||"";
  $("sum").innerHTML=
    '<div><div class="k">Stock réel · net</div><div class="v">'+eur(sv)+'</div><div class="s">achat '+eur(sc)+' · dépréc. '+pc(sc,sv)+'</div></div>'+
    '<div class="lb"><div class="k">Labo / démo · net</div><div class="v">'+eur(lv)+'</div><div class="s">achat '+eur(lc)+' · dépréc. '+pc(lc,lv)+'</div></div>'+
    '<div class="neg"><div class="k">Dépréciation totale</div><div class="v">'+neg(sc-sv+lc-lv)+'</div><div class="s">stock '+neg(sc-sv)+' · labo '+neg(lc-lv)+'</div></div>'+
    '<div><div class="k">Attente livraison</div><div class="v">'+eur(av)+'</div><div class="s">'+(n.attente||0)+' références'+(late?' · <span class="tag late">'+late+' en retard</span>':'')+'</div></div>'+
    '<div class="big"><div class="k">Valeur nette</div><div class="v">'+eur(sv+lv)+'</div><div class="s">achat '+eur(sc+lc)+' · hors attente</div></div>';
}

/* ---------- table articles ---------- */
function visible(){
  var q=S.q.trim().toLowerCase();
  return items.filter(function(i){
    if(i.loc!==S.tab) return false;
    if(!S.empty && !(i.qty>0)) return false;
    if(S.cat && i.cat!==S.cat) return false;
    if(S.unchk && i.verifie) return false;
    if(q && ((i.ref||"")+" "+(i.des||"")+" "+(i.brand||"")+" "+(i.client||"")+" "+(i.note||"")).toLowerCase().indexOf(q)<0) return false;
    return true;
  });
}
function sortVal(i,k){
  if(k==="total") return i.qty*i.pu;
  if(k==="vnc") return dep(i).vnc;
  if(k==="pct") return pctOf(i);
  if(k==="cum") return dep(i).cum;
  var v=i[k]; return typeof v==="string"?v.toLowerCase():(v||0);
}
function th(k,label,cls){ var a=S.sort===k?(S.dir>0?" ▲":" ▼"):""; return '<th class="'+(cls||"")+'" data-sort="'+k+'">'+label+'<span class="ar">'+a+'</span></th>'; }

function renderChips(){
  var used={}; items.forEach(function(i){ if(i.loc===S.tab && (S.empty||i.qty>0)) used[i.cat]=(used[i.cat]||0)+1; });
  var h='<button class="chip" data-cat="" aria-pressed="'+(!S.cat)+'">Toutes</button>';
  CATS.concat(Object.keys(used).filter(function(c){return CATS.indexOf(c)<0;})).forEach(function(c){ if(used[c]) h+='<button class="chip" data-cat="'+esc(c)+'" aria-pressed="'+(S.cat===c)+'">'+esc(c)+' <span class="mono">'+used[c]+'</span></button>'; });
  var tabItems=items.filter(function(i){ return i.loc===S.tab && i.qty>0; }), nv=tabItems.filter(function(i){return i.verifie;}).length;
  h+='<span class="chk"><span class="tag '+(nv===tabItems.length&&nv?'ok':'st')+'">'+nv+' / '+tabItems.length+' vérifiés</span>'+
    '<label><input type="checkbox" id="onlyUnchk"'+(S.unchk?" checked":"")+'> Non vérifiés seulement</label>'+
    '<label><input type="checkbox" id="showEmpty"'+(S.empty?" checked":"")+'> Épuisés</label>'+
    (writable&&nv?'<button class="linkbtn" id="resetChk" type="button">Nouvel inventaire</button>':'')+'</span>';
  $("chips").innerHTML=h;
}
function renderItems(){
  var tab=S.tab, labo=tab!=="attente", att=tab==="attente", t=today();
  var list=visible().sort(function(a,b){ var x=sortVal(a,S.sort),y=sortVal(b,S.sort); return (x<y?-1:x>y?1:0)*S.dir; });
  var h='<table><thead><tr>'+th("verifie",'<span title="Vérifié à l’inventaire">✓</span>',"ck")+th("ref","Référence")+th("des","Désignation")+th("qty","Qté","r")+th("pu","P.U. HT","r")+th("total","Total HT","r");
  if(labo) h+=th("pct","Dépréc.","r")+th("cum","Montant déprécié","r")+th("vnc","Valeur nette","r");
  if(att) h+=th("client","Client")+th("eta","Livraison prévue");
  h+='<th class="nos"></th></tr></thead><tbody>';
  var tq=0,tt=0,tc=0,tv=0;
  list.forEach(function(i){
    var tot=i.qty*i.pu, d=dep(i), am=isAm(i); tq+=i.qty; tt+=tot; tc+=d.cum; tv+=d.vnc;
    var has=i.qty>0;
    h+='<tr data-id="'+esc(i.id)+'"'+(has?"":' class="zero"')+'><td class="ck"><input type="checkbox" class="vchk" aria-label="Vérifié"'+(i.verifie?" checked":"")+(writable?"":" disabled")+' title="'+(i.verifie?"Vérifié le "+fd(i.verifie_le):"À vérifier")+'"></td><td class="ref">'+esc(i.ref)+'<small>'+esc(i.cat)+'</small></td>'+
      '<td class="des">'+esc(i.des)+(i.brand||i.note?'<small>'+esc([i.brand,i.note].filter(Boolean).join(" · "))+'</small>':"")+'</td>'+
      '<td class="num" data-l="Qté">'+(has?NUM.format(i.qty):'<span class="tag out">0</span>')+'</td><td class="num" data-l="P.U. HT">'+eur(i.pu)+'</td><td class="num" data-l="Total HT">'+eur(tot)+'</td>';
    if(labo){
      h+='<td class="num" data-l="Dépréciation">'+(am?NUM.format(d.pct)+' %'+(i.pct==null?'<div class="hint" style="font-size:10px">défaut</div>':''):'<span class="tag am">Non dépréciable</span>')+'</td>'+
        '<td class="num" data-l="Montant déprécié">'+(am?neg(d.cum):'—')+'</td>'+
        '<td class="num" data-l="Valeur nette">'+eur(d.vnc)+(am?'<div class="bar-dep" title="'+NUM.format(d.pct)+' % déprécié"><i style="width:'+d.pct+'%"></i></div>':'')+'</td>';
    }
    if(att){
      var late=has&&i.eta&&i.eta<t;
      h+='<td class="des" data-l="Client">'+esc(i.client||"—")+'</td><td class="dt" data-l="Livraison prévue">'+fd(i.eta)+(late?' <span class="tag late">Retard</span>':'')+'</td>';
    }
    h+='<td class="act">';
    if(writable){
      if(att) h+='<button class="ib go" data-a="deliver"'+(has?"":" disabled")+' title="Livré au client">Livré</button> ';
      h+='<button class="ib" data-a="move"'+(has?"":" disabled")+' title="Transférer" aria-label="Transférer">⇄</button> '+
        '<button class="ib" data-a="out"'+(has?"":" disabled")+' title="Sortie" aria-label="Sortie">−</button> '+
        '<button class="ib" data-a="in" title="Entrée" aria-label="Entrée">+</button> '+
        '<button class="ib" data-a="edit" title="Modifier" aria-label="Modifier">✎</button>';
    }
    h+='</td></tr>';
  });
  h+='</tbody>';
  if(list.length){
    h+='<tfoot><tr><td colspan="3">Total · '+list.length+' ligne'+(list.length>1?"s":"")+'</td><td class="num">'+NUM.format(tq)+'</td><td></td><td class="num">'+eur(tt)+'</td>';
    if(labo) h+='<td></td><td class="num">'+neg(tc)+'</td><td class="num">'+eur(tv)+'</td>';
    if(att) h+='<td></td><td></td>';
    h+='<td></td></tr></tfoot>';
  }
  h+='</table>';
  if(!list.length) h+='<div class="empty">'+(ready?(items.some(function(i){return i.loc===tab;})?'<b>Aucun article ne correspond.</b>Modifiez la recherche ou le filtre de catégorie.':(att?'<b>Rien en attente de livraison.</b>Ajoutez un article commandé pour un client avec « + Article », ou réservez du stock avec ⇄.':'<b>Aucun article pour l’instant.</b>Ajoutez le premier avec « + Article ».')):'<b>Chargement du stock…</b>')+'</div>';
  $("tw").innerHTML=h;
  $("legend").innerHTML=writable&&list.length?(att?'<span><b>Livré</b>sortie chez le client</span>':'')+'<span><b>⇄</b>transférer</span><span><b>−</b>sortie</span><span><b>+</b>entrée</span><span><b>✎</b>modifier</span>':'';
}
var MT={entree:"Entrée",sortie:"Sortie",livraison:"Livraison",transfert:"Transfert",creation:"Création",ajustement:"Ajustement",suppression:"Suppression"};
function renderMoves(){
  var q=S.q.trim().toLowerCase();
  var list=moves.filter(function(m){ return !q || ((m.ref||"")+" "+(m.des||"")+" "+(m.client||"")+" "+(m.note||"")).toLowerCase().indexOf(q)>=0; });
  var h='<table><thead><tr><th class="nos">Date</th><th class="nos">Type</th><th class="nos">Référence</th><th class="nos">Désignation</th><th class="nos r">Qté</th><th class="nos">De → vers</th><th class="nos r">Valeur</th><th class="nos">Client / note</th></tr></thead><tbody>';
  list.forEach(function(m){
    var cls=m.type==="sortie"||m.type==="suppression"?"out":m.type==="transfert"?"lb":m.type==="entree"||m.type==="creation"||m.type==="livraison"?"ok":"am";
    h+='<tr><td class="dt" data-l="Date">'+fd(m.date)+'</td><td data-l="Type"><span class="tag '+cls+'">'+esc(MT[m.type]||m.type)+'</span></td><td class="ref">'+esc(m.ref)+'</td><td class="des">'+esc(m.des)+'</td><td class="num" data-l="Qté">'+(m.qty?NUM.format(m.qty):"—")+'</td><td data-l="De → vers">'+esc((m.from?LOCS[m.from]||m.from:"")+(m.from&&m.to?" → ":"")+(m.to?LOCS[m.to]||m.to:""))+'</td><td class="num" data-l="Valeur">'+(m.value!=null?eur(m.value):"")+'</td><td class="des" data-l="Client / note">'+esc([m.client,m.note].filter(Boolean).join(" · "))+'</td></tr>';
  });
  h+='</tbody></table>';
  if(!list.length) h+='<div class="empty"><b>Aucun mouvement enregistré.</b>Les transferts, entrées, sorties et livraisons apparaîtront ici.</div>';
  $("tw").innerHTML=h; $("legend").innerHTML="";
}
function render(){
  ["stock","labo","attente","moves"].forEach(function(t){ $("t-"+t).setAttribute("aria-pressed",S.tab===t); });
  renderSum();
  if(S.tab==="moves"){ $("chips").innerHTML=""; renderMoves(); } else { renderChips(); renderItems(); }
  $("addBtn").hidden=!writable;
}

/* ---------- panneaux ---------- */
function openPanel(html,onOpen){ $("pn").innerHTML=html; $("ov").hidden=false; if(onOpen) onOpen(); var f=$("pn").querySelector("input,select"); if(f) f.focus(); }
function closePanel(){ $("ov").hidden=true; $("pn").innerHTML=""; }
$("ov").addEventListener("click",function(e){ if(e.target===$("ov")) closePanel(); });
document.addEventListener("keydown",function(e){ if(e.key==="Escape" && !$("ov").hidden) closePanel(); });
function find(id){ return items.filter(function(i){return i.id===id;})[0]; }
function catOpts(sel){ return CATS.map(function(c){ return '<option'+(c===sel?" selected":"")+'>'+esc(c)+'</option>'; }).join(""); }
function locOpts(sel,except){ return Object.keys(LOC).filter(function(k){return k!==except;}).map(function(k){ return '<option value="'+k+'"'+(k===sel?" selected":"")+'>'+LOC[k]+'</option>'; }).join(""); }
function msg(t,err){ var s=$("status"); s.textContent=t; s.className="status"+(err?" err":""); clearTimeout(msg.t); msg.t=setTimeout(function(){ s.textContent=""; },6000); }
function fail(e){ console.warn(e); msg("Enregistrement impossible : "+((e&&e.message)||"erreur réseau")+".",true); }
function ok(r){ if(r&&r.error) throw r.error; return r; }
function toRow(d){ var o={org_id:org.id}; ["ref","des","cat","brand","loc","qty","pu","amort","pct","client","eta","note"].forEach(function(k){ if(k in d) o[k]=d[k]===""?null:d[k]; }); if("dateIn" in d) o.date_in=d.dateIn||null; if(o.eta==="") o.eta=null; return o; }
function addItem(d){ return sb.from("stk_articles").insert(toRow(d)).then(ok); }
function setItem(id,d){ return sb.from("stk_articles").update(toRow(d)).eq("id",id).then(ok); }
function updItem(id,d){ return sb.from("stk_articles").update(d).eq("id",id).then(ok); }
function delItem(id){ return sb.from("stk_articles").delete().eq("id",id).then(ok); }
function log(m){ var row={org_id:org.id,user_id:me.id,date:m.date||today(),type:m.type,ref:m.ref,des:m.des,qty:m.qty,from_loc:m.from||null,to_loc:m.to||null,value:m.value==null?null:Math.round(m.value*100)/100,client:m.client||null,note:m.note||null};
  return sb.from("stk_mouvements").insert(row).then(ok).then(function(){ return load(); }); }
function clean(o){ var r={}; Object.keys(o).forEach(function(k){ if(["id","org_id","created_at","updated_at","date_in"].indexOf(k)<0) r[k]=o[k]; }); return r; }

function editPanel(it){
  var isNew=!it; it=it||{loc:S.tab==="moves"?"stock":S.tab,cat:"Caméra",qty:1,pu:0,dateIn:today()};
  var am=isAm(it);
  openPanel('<h2>'+(isNew?"Nouvel article":"Modifier l’article")+'</h2><div class="sub2">'+(isNew?"Saisie d’une entrée en stock, au labo ou en attente de livraison.":esc(it.ref))+'</div>'+
    '<div class="fg">'+
    '<div class="f c2"><label class="lab" for="e-ref">Référence</label><input type="text" id="e-ref" class="mono" value="'+esc(it.ref)+'"></div>'+
    '<div class="f c4"><label class="lab" for="e-des">Désignation</label><input type="text" id="e-des" value="'+esc(it.des)+'"></div>'+
    '<div class="f c2"><label class="lab" for="e-cat">Catégorie</label><select id="e-cat">'+catOpts(it.cat)+'</select></div>'+
    '<div class="f c2"><label class="lab" for="e-brand">Marque</label><input type="text" id="e-brand" value="'+esc(it.brand)+'"></div>'+
    '<div class="f c2"><label class="lab" for="e-loc">Affectation</label><select id="e-loc">'+locOpts(it.loc)+'</select></div>'+
    '<div class="f c2"><label class="lab" for="e-qty">Quantité</label><input type="number" id="e-qty" min="0" step="1" value="'+(it.qty||0)+'"></div>'+
    '<div class="f c2"><label class="lab" for="e-pu">Prix unitaire HT (€)</label><input type="number" id="e-pu" min="0" step="0.01" value="'+(it.pu||0)+'"></div>'+
    '<div class="f c2"><label class="lab" for="e-date">Date d’entrée</label><input type="date" id="e-date" value="'+esc(it.dateIn||"")+'"></div>'+
    '<div class="f c3 ap"><label class="lab" for="e-client">Client</label><input type="text" id="e-client" value="'+esc(it.client)+'"></div>'+
    '<div class="f c3 ap"><label class="lab" for="e-eta">Livraison prévue</label><input type="date" id="e-eta" value="'+esc(it.eta||"")+'"></div>'+
    '<div class="f c4 dpl"><label class="cb" for="e-am"><input type="checkbox" id="e-am"'+(am?" checked":"")+'> Dépréciable <small>— décoché : garde sa valeur d’achat (objectif, filtre…)</small></label></div>'+
    '<div class="f c2 dpl dpa"><label class="lab" for="e-pct">Dépréciation (%)</label><input type="number" id="e-pct" min="0" max="100" step="1" value="'+(it.pct!=null?it.pct:defPct(it.loc))+'"></div>'+
    '<div class="f c6 dpl dpa"><div class="prev" id="e-prev"></div></div>'+
    '<div class="f c6"><label class="lab" for="e-note">Note</label><input type="text" id="e-note" value="'+esc(it.note)+'" placeholder="N° de série, emplacement, état…"></div>'+
    '</div><div class="act">'+(isNew?"":'<button class="btn danger" id="e-del" type="button">Supprimer</button>')+'<span class="grow"></span><button class="btn" id="e-cancel" type="button">Annuler</button><button class="btn primary" id="e-save" type="button">Enregistrer</button></div>',
  function(){
    var amTouched=!isNew||it.amort!=null, pctTouched=false;
    function sync(){
      var loc=$("e-loc").value, labo=loc!=="attente", amOn=$("e-am").checked;
      if(it.pct==null&&!pctTouched) $("e-pct").value=defPct(loc);
      Array.prototype.forEach.call(document.querySelectorAll(".ap"),function(e){ e.hidden=loc!=="attente"; });
      Array.prototype.forEach.call(document.querySelectorAll(".dpl"),function(e){ e.hidden=!labo; });
      Array.prototype.forEach.call(document.querySelectorAll(".dpa"),function(e){ e.hidden=!(labo&&amOn); });
      if(!(labo&&amOn)) return;
      var d=dep({loc:"labo",amort:true,qty:num($("e-qty").value),pu:num($("e-pu").value),pct:num($("e-pct").value)});
      $("e-prev").innerHTML='Valeur d’achat <b>'+eur(d.cost)+'</b> − dépréciation <b>'+eur(d.cum)+'</b> = valeur nette <b>'+eur(d.vnc)+'</b>';
    }
    $("e-cat").addEventListener("change",function(){ if(!amTouched) $("e-am").checked=NOAM.indexOf(this.value)<0; sync(); });
    $("e-am").addEventListener("change",function(){ amTouched=true; sync(); });
    $("e-pct").addEventListener("input",function(){ pctTouched=true; });
    ["e-loc","e-qty","e-pu","e-pct"].forEach(function(k){ $(k).addEventListener("input",sync); $(k).addEventListener("change",sync); });
    sync();
    $("e-cancel").onclick=closePanel;
    $("e-save").onclick=function(){
      var ref=$("e-ref").value.trim(), des=$("e-des").value.trim();
      if(!ref&&!des){ $("e-ref").focus(); return; }
      var d={ref:ref,des:des,cat:$("e-cat").value,brand:$("e-brand").value.trim(),loc:$("e-loc").value,qty:num($("e-qty").value),pu:num($("e-pu").value),
        dateIn:$("e-date").value,amort:$("e-am").checked,note:$("e-note").value.trim(),client:null,eta:null,pct:null};
      if(d.loc!=="attente"&&d.amort){ var pv=Math.max(0,Math.min(100,num($("e-pct").value))); d.pct=(it.pct==null&&!pctTouched&&pv===defPct(d.loc))?null:pv; }
      if(d.loc==="attente"){ d.client=$("e-client").value.trim(); d.eta=$("e-eta").value||null; }
      this.disabled=true; var self=this;
      var p=isNew?addItem(d).then(function(){ return log({type:"creation",ref:d.ref,des:d.des,qty:d.qty,to:d.loc,value:d.qty*d.pu,client:d.client}); })
        :setItem(it.id,d).then(function(){
          if(d.qty!==it.qty) return log({type:"ajustement",ref:d.ref,des:d.des,qty:d.qty-it.qty,to:d.loc,note:"Quantité "+it.qty+" → "+d.qty});
          if(d.loc!==it.loc) return log({type:"transfert",ref:d.ref,des:d.des,qty:d.qty,from:it.loc,to:d.loc,value:d.qty*d.pu,client:d.client,note:"Modifié depuis la fiche"});
        });
      p.then(function(){ closePanel(); load(); msg(isNew?"Article ajouté.":"Article enregistré."); },function(e){ self.disabled=false; fail(e); });
    };
    if(!isNew){ var arm=false; $("e-del").onclick=function(){
      if(!arm){ arm=true; this.classList.add("armed"); this.textContent="Confirmer la suppression"; return; }
      delItem(it.id).then(function(){ return log({type:"suppression",ref:it.ref,des:it.des,qty:it.qty,from:it.loc}); }).then(function(){ closePanel(); load(); msg("Article supprimé."); },fail);
    }; }
  });
}

function movePanel(it){
  var first=it.loc==="stock"?"labo":"stock";
  openPanel('<h2>Transférer</h2><div class="sub2"><span class="mono">'+esc(it.ref)+'</span> · '+esc(it.des)+' · '+it.qty+' en '+LOC[it.loc].toLowerCase()+'</div>'+
    '<div class="fg"><div class="f c2"><label class="lab" for="m-to">Vers</label><select id="m-to">'+locOpts(first,it.loc)+'</select></div>'+
    '<div class="f c2"><label class="lab" for="m-qty">Quantité</label><input type="number" id="m-qty" min="1" max="'+it.qty+'" step="1" value="'+it.qty+'"></div>'+
    '<div class="f c2"><label class="lab" for="m-date">Date</label><input type="date" id="m-date" value="'+today()+'"></div>'+
    '<div class="f c4 ml"><label class="cb" for="m-am"><input type="checkbox" id="m-am"'+(isAm(it)?" checked":"")+'> Dépréciable</label></div>'+
    '<div class="f c2 ml mla"><label class="lab" for="m-pct">Dépréciation (%)</label><input type="number" id="m-pct" min="0" max="100" step="1" value="'+(it.pct!=null?it.pct:defPct(first))+'"></div>'+
    '<div class="f c3 ma"><label class="lab" for="m-client">Client</label><input type="text" id="m-client" value="'+esc(it.client)+'"></div>'+
    '<div class="f c3 ma"><label class="lab" for="m-eta">Livraison prévue</label><input type="date" id="m-eta" value="'+esc(it.eta||"")+'"></div>'+
    '<div class="f c6"><label class="lab" for="m-note">Note</label><input type="text" id="m-note" placeholder="Motif, salon, démo…"></div>'+
    '<div class="f c6"><div class="prev" id="m-prev"></div></div></div>'+
    '<div class="act"><button class="btn" id="m-cancel" type="button">Annuler</button><button class="btn primary" id="m-ok" type="button">Transférer</button></div>',
  function(){
    function pv(){
      var to=$("m-to").value, n=Math.min(it.qty,Math.max(1,Math.floor(num($("m-qty").value)))), date=$("m-date").value||today(), am=$("m-am").checked;
      var dz=to!=="attente";
      if(it.pct==null&&!mTouched) $("m-pct").value=defPct(to);
      Array.prototype.forEach.call(document.querySelectorAll(".ml"),function(e){ e.hidden=!dz; });
      Array.prototype.forEach.call(document.querySelectorAll(".mla"),function(e){ e.hidden=!(dz&&am); });
      Array.prototype.forEach.call(document.querySelectorAll(".ma"),function(e){ e.hidden=to!=="attente"; });
      var t, p=Math.max(0,Math.min(100,num($("m-pct").value)));
      if(dz) t=am?'Valeur d’achat <b>'+eur(n*it.pu)+'</b>, dépréciée de '+NUM.format(p)+' % : valeur nette <b>'+eur(n*it.pu*(1-p/100))+'</b>.':'Article non dépréciable : il garde sa valeur d’achat <b>'+eur(n*it.pu)+'</b>.';
      else t='Valeur transférée : <b>'+eur(n*it.pu)+'</b> (prix d’achat). Elle sort de la valeur nette jusqu’à la livraison.';
      $("m-prev").innerHTML=t;
    }
    var mTouched=false; $("m-pct").addEventListener("input",function(){ mTouched=true; });
    ["m-to","m-qty","m-date","m-am","m-pct"].forEach(function(k){ $(k).addEventListener("input",pv); $(k).addEventListener("change",pv); }); pv();
    $("m-cancel").onclick=closePanel;
    $("m-ok").onclick=function(){
      var to=$("m-to").value, n=Math.floor(num($("m-qty").value)), date=$("m-date").value||today();
      if(n<1||n>it.qty){ $("m-qty").focus(); return; }
      var moved=clean(it); moved.qty=n; moved.loc=to; moved.ts=Date.now(); moved.client=null; moved.eta=null;
      moved.pct=null;
      if(to!=="attente"){ moved.amort=$("m-am").checked; if(moved.amort){ var pv=Math.max(0,Math.min(100,num($("m-pct").value))); moved.pct=(it.pct==null&&!mTouched&&pv===defPct(to))?null:pv; } }
      if(to==="attente"){ moved.client=$("m-client").value.trim(); moved.eta=$("m-eta").value||null; }
      this.disabled=true; var self=this;
      var p=n===it.qty?setItem(it.id,moved):updItem(it.id,{qty:it.qty-n}).then(function(){ return addItem(moved); });
      p.then(function(){ return log({type:"transfert",date:date,ref:it.ref,des:it.des,qty:n,from:it.loc,to:to,value:n*unitVnc(moved),client:moved.client,note:$("m-note").value.trim()}); })
       .then(function(){ closePanel(); load(); msg(n+" × "+it.ref+" → "+LOC[to].toLowerCase()+"."); },function(e){ self.disabled=false; fail(e); });
    };
  });
}

function qtyPanel(it,kind){
  var out=kind!=="in", dlv=kind==="deliver";
  openPanel('<h2>'+(dlv?"Livraison au client":out?"Sortie":"Entrée")+'</h2><div class="sub2"><span class="mono">'+esc(it.ref)+'</span> · '+esc(it.des)+' · '+it.qty+' en '+LOC[it.loc].toLowerCase()+'</div>'+
    '<div class="fg"><div class="f c2"><label class="lab" for="q-qty">Quantité</label><input type="number" id="q-qty" min="1"'+(out?' max="'+it.qty+'"':"")+' step="1" value="'+(dlv?it.qty:1)+'"></div>'+
    '<div class="f c2"><label class="lab" for="q-date">Date</label><input type="date" id="q-date" value="'+today()+'"></div>'+
    (out?'<div class="f c2"><label class="lab" for="q-client">Client / destination</label><input type="text" id="q-client" value="'+esc(it.client)+'"></div>':'<div class="f c2"><label class="lab" for="q-pu">Prix unitaire HT (€)</label><input type="number" id="q-pu" min="0" step="0.01" value="'+(it.pu||0)+'"></div><div class="f c6 hint">Si le prix diffère, le P.U. de la ligne est recalculé en coût moyen pondéré.</div>')+
    '<div class="f c6"><label class="lab" for="q-note">Note</label><input type="text" id="q-note" placeholder="'+(dlv?"BL, mise en service…":out?"Intégré sur machine, vendu, rebut…":"Réception partielle, BL…")+'"></div></div>'+
    '<div class="act"><button class="btn" id="q-cancel" type="button">Annuler</button><button class="btn primary" id="q-ok" type="button">'+(dlv?"Valider la livraison":out?"Valider la sortie":"Valider l’entrée")+'</button></div>',
  function(){
    $("q-cancel").onclick=closePanel;
    $("q-ok").onclick=function(){
      var n=Math.floor(num($("q-qty").value)), date=$("q-date").value||today(), note=$("q-note").value.trim(), client=out?$("q-client").value.trim():null;
      if(n<1||(out&&n>it.qty)){ $("q-qty").focus(); return; }
      var upd, value;
      if(out){ upd={qty:it.qty-n}; value=n*unitVnc(it); }
      else { var pu=num($("q-pu").value), nq=it.qty+n; upd={qty:nq,pu:nq?Math.round(((it.qty*it.pu)+(n*pu))/nq*100)/100:pu}; value=n*pu; }
      this.disabled=true; var self=this;
      updItem(it.id,upd).then(function(){ return log({type:dlv?"livraison":out?"sortie":"entree",date:date,ref:it.ref,des:it.des,qty:n,from:out?it.loc:null,to:out?null:it.loc,value:value,client:client,note:note}); })
        .then(function(){ closePanel(); load(); msg((dlv?"Livraison":out?"Sortie":"Entrée")+" enregistrée : "+n+" × "+it.ref+"."); },function(e){ self.disabled=false; fail(e); });
    };
  });
}

/* ---------- export CSV ---------- */
function csv(){
  var ord={stock:0,labo:1,attente:2};
  var rows=[["Affectation","Référence","Désignation","Catégorie","Marque","Qté","PU HT","Total HT","Dépréciable","Dépréciation %","Montant déprécié","Valeur nette","Client","Livraison prévue","Vérifié le","Note"]];
  items.filter(function(i){return i.qty>0;}).sort(function(a,b){ return (ord[a.loc]-ord[b.loc])||(a.ref||"").localeCompare(b.ref||""); }).forEach(function(i){
    var d=dep(i), f=function(n){ return (Math.round(n*100)/100).toFixed(2).replace(".",","); }, lb=i.loc!=="attente", am=isAm(i);
    rows.push([LOCS[i.loc],i.ref,i.des,i.cat,i.brand,i.qty,f(i.pu),f(d.cost),lb?(am?"Oui":"Non"):"",lb&&am?String(d.pct).replace(".",","):"",f(d.cum),f(d.vnc),i.client,i.eta?fd(i.eta):"",i.verifie?fd(i.verifie_le):"",i.note]);
  });
  return "﻿"+rows.map(function(r){ return r.map(function(c){ c=String(c==null?"":c); return /[;"\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c; }).join(";"); }).join("\r\n");
}
$("csvBtn").addEventListener("click",function(){
  var u=URL.createObjectURL(new Blob([csv()],{type:"text/csv;charset=utf-8"})), a=document.createElement("a");
  a.href=u; a.download="Stock-Cevilog_"+today()+".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); },2000);
});
$("printBtn").addEventListener("click",function(){ window.print(); });

/* ---------- export PDF (jsPDF chargé à la demande) ---------- */
function loadScript(src){ return new Promise(function(res,rej){ var x=document.createElement("script"); x.src=src; x.onload=res; x.onerror=function(){ rej(new Error("Chargement impossible : "+src)); }; document.head.appendChild(x); }); }
var pdfLib=null;
function pdfReady(){
  if(window.jspdf&&window.jspdf.jsPDF&&window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
  return pdfLib||(pdfLib=loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js").then(function(){ return loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"); }).catch(function(e){ pdfLib=null; throw e; }));
}
function imgData(src){ return fetch(src).then(function(r){ return r.blob(); }).then(function(b){ return new Promise(function(res){ var f=new FileReader(); f.onload=function(){ res(f.result); }; f.readAsDataURL(b); }); }).catch(function(){ return null; }); }
// Les polices PDF standard ne connaissent que le jeu WinAnsi : on remplace les quelques caractères hors jeu.
function P(t){ return String(t==null?"":t).replace(/[   ]/g," ").replace(/−/g,"-").replace(/→/g,">").replace(/[^\x00-\xff€’‘“”–—…Œœ•×]/g,"?"); }
function pdfRows(loc,list){
  var labo=loc!=="attente", tot={q:0,c:0,d:0,v:0};
  var head=labo?["Vérif.","Référence","Désignation","Catégorie","Qté","P.U. HT","Total HT","Dépréc.","Montant déprécié","Valeur nette"]:["Référence","Désignation","Catégorie","Qté","P.U. HT","Total HT","Client","Livraison prévue"];
  var body=list.map(function(i){
    var d=dep(i), am=isAm(i); tot.q+=i.qty; tot.c+=d.cost; tot.d+=d.cum; tot.v+=d.vnc;
    var des=i.des+([i.brand,i.note].filter(Boolean).length?"\n"+[i.brand,i.note].filter(Boolean).join(" · "):"");
    return labo?[i.verifie?"Oui":"",i.ref,des,i.cat,NUM.format(i.qty),eur(i.pu),eur(d.cost),am?NUM.format(d.pct)+" %":"non",am?neg(d.cum):"-",eur(d.vnc)]
      :[i.ref,des,i.cat,NUM.format(i.qty),eur(i.pu),eur(d.cost),i.client||"-",fd(i.eta)];
  });
  var foot=labo?[["",list.length+" ligne"+(list.length>1?"s":""),"","",NUM.format(tot.q),"",eur(tot.c),"",neg(tot.d),eur(tot.v)]]:[[list.length+" ligne"+(list.length>1?"s":""),"","",NUM.format(tot.q),"",eur(tot.c),"",""]];
  var right=labo?[4,5,6,7,8,9]:[3,4,5];
  return {head:[head.map(P)],body:body.map(function(r){return r.map(P);}),foot:foot.map(function(r){return r.map(P);}),right:right,tot:tot};
}
function exportPdf(scope){
  var btn=$("pdfBtn"); btn.disabled=true; msg("Préparation du PDF…");
  Promise.all([pdfReady(),imgData("logo-clair.png")]).then(function(r){
    var logo=r[1], J=window.jspdf.jsPDF, doc=new J({orientation:"landscape",unit:"mm",format:"a4"});
    var W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=12, INK=[22,21,15], GOLD=[255,201,4], MUT=[138,133,118];
    function header(){
      if(logo) doc.addImage(logo,"PNG",M,8,44,11);
      doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor.apply(doc,MUT);
      doc.text(P("6, rue Icare • 67960 Entzheim • France"),W-M,10,{align:"right"});
      doc.text(P("Tél. +33 (0)7 43 68 02 00 • cbrandt@cevilog.com • www.cevilog.com"),W-M,14,{align:"right"});
      doc.setFillColor.apply(doc,GOLD); doc.rect(M,22,(W-2*M)*0.34,0.9,"F"); doc.setFillColor(228,224,211); doc.rect(M+(W-2*M)*0.34,22,(W-2*M)*0.66,0.9,"F");
    }
    function footer(){
      var n=doc.internal.getNumberOfPages();
      for(var p=1;p<=n;p++){ doc.setPage(p); doc.setFontSize(7); doc.setTextColor.apply(doc,MUT);
        doc.text(P("CEVILOG SAS au capital de 20.000 euros • SIRET 520 499 021 000 35 • RCS Strasbourg TI 520 499 021 • TVA FR 96 520 499 021"),M,H-6);
        doc.text("Page "+p+" / "+n,W-M,H-6,{align:"right"}); }
    }
    var title=scope==="all"?"Inventaire complet":S.tab==="moves"?"Mouvements":LOC[S.tab];
    header();
    doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor.apply(doc,INK); doc.text(P("Gestion de stock — "+title),M,32);
    doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor.apply(doc,MUT);
    var sub="Édité le "+fd(today())+" par "+(me&&me.email||"")+" • Dépréciation par défaut : stock "+NUM.format(cfg.pctStock)+" %, labo "+NUM.format(cfg.pct)+" %";
    if(scope!=="all"&&S.tab!=="moves"&&(S.cat||S.q||S.unchk)) sub+=" • Filtre : "+[S.cat,S.q&&("« "+S.q+" »"),S.unchk&&"non vérifiés"].filter(Boolean).join(", ");
    doc.text(P(sub),M,37.5);
    var y=42;
    var tableStyle={theme:"grid",margin:{left:M,right:M,top:28,bottom:12},styles:{font:"helvetica",fontSize:7.6,cellPadding:1.4,lineColor:[228,224,211],lineWidth:0.15,textColor:INK,overflow:"linebreak",valign:"middle"},
      headStyles:{fillColor:INK,textColor:[255,255,255],fontStyle:"bold",fontSize:7},footStyles:{fillColor:[255,248,224],textColor:INK,fontStyle:"bold"},
      alternateRowStyles:{fillColor:[251,250,244]},didDrawPage:function(d){ if(d.pageNumber>1) header(); }};
    function section(label,loc,list){
      var t=pdfRows(loc,list), cs={};
      t.right.forEach(function(c){ cs[c]={halign:"right"}; });
      var refCol=loc==="attente"?0:1; cs[refCol]={fontStyle:"bold",cellWidth:34}; cs[refCol+1]={cellWidth:loc==="attente"?78:70};
      if(loc!=="attente") cs[0]={halign:"center",cellWidth:11};
      if(label){ if(y>H-40){ doc.addPage(); header(); y=30; } doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor.apply(doc,INK); doc.text(P(label),M,y+4);
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor.apply(doc,MUT);
        doc.text(P(loc==="attente"?"Achat "+eur(t.tot.c)+" • hors valeur nette":"Achat "+eur(t.tot.c)+" • dépréciation "+neg(t.tot.d)+" • valeur nette "+eur(t.tot.v)),W-M,y+4,{align:"right"}); y+=7; }
      doc.autoTable(Object.assign({},tableStyle,{startY:y,head:t.head,body:t.body,foot:t.foot,showFoot:"lastPage",columnStyles:cs}));
      y=doc.lastAutoTable.finalY+8; return t.tot;
    }
    function sorted(list){ return list.sort(function(a,b){ return (a.cat||"").localeCompare(b.cat||"")||(a.ref||"").localeCompare(b.ref||""); }); }
    if(scope==="all"){
      var T={}; ["stock","labo","attente"].forEach(function(l){ var list=sorted(items.filter(function(i){ return i.loc===l&&i.qty>0; })); if(list.length) T[l]=section(LOC[l],l,list); });
      var net=(T.stock?T.stock.v:0)+(T.labo?T.labo.v:0), ach=(T.stock?T.stock.c:0)+(T.labo?T.labo.c:0);
      if(y>H-30){ doc.addPage(); header(); y=30; }
      doc.setFillColor(255,248,224); doc.rect(W-M-110,y-2,110,14,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(143,109,0);
      doc.text(P("VALEUR NETTE (stock + labo)"),W-M-106,y+3); doc.setFontSize(13); doc.setTextColor.apply(doc,INK); doc.text(P(eur(net)),W-M-4,y+8.5,{align:"right"});
      doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor.apply(doc,MUT); doc.text(P("achat "+eur(ach)+" • dépréciation "+neg(ach-net)),W-M-106,y+9.5);
    } else if(S.tab==="moves"){
      var q=S.q.trim().toLowerCase(), L=moves.filter(function(m){ return !q||((m.ref||"")+" "+(m.des||"")+" "+(m.client||"")+" "+(m.note||"")).toLowerCase().indexOf(q)>=0; });
      doc.autoTable(Object.assign({},tableStyle,{startY:y,head:[["Date","Type","Référence","Désignation","Qté","De > vers","Valeur","Client / note"].map(P)],
        body:L.map(function(m){ return [fd(m.date),MT[m.type]||m.type,m.ref,m.des,m.qty?NUM.format(m.qty):"-",(m.from?LOCS[m.from]:"")+(m.from&&m.to?" > ":"")+(m.to?LOCS[m.to]:""),m.value!=null?eur(m.value):"",[m.client,m.note].filter(Boolean).join(" · ")].map(P); }),
        columnStyles:{2:{fontStyle:"bold"},4:{halign:"right"},6:{halign:"right"}}}));
    } else {
      var list=visible().sort(function(a,b){ var x=sortVal(a,S.sort),z=sortVal(b,S.sort); return (x<z?-1:x>z?1:0)*S.dir; });
      section("",S.tab,list);
    }
    footer();
    var name="Stock-Cevilog_"+(scope==="all"?"inventaire":S.tab)+"_"+today()+".pdf";
    doc.save(name); msg("PDF enregistré : "+name);
  }).catch(function(e){ console.warn(e); msg("Export PDF impossible : "+(e.message||"erreur")+". Vérifiez la connexion.",true); }).then(function(){ btn.disabled=false; });
}
$("pdfBtn").addEventListener("click",function(){
  var cur=S.tab==="moves"?"Mouvements":LOC[S.tab];
  openPanel('<h2>Exporter en PDF</h2><div class="sub2">A4 paysage, en-tête Cevilog, numéro de page.</div>'+
    '<div class="fg"><label class="f c6 cb" for="px-cur"><input type="radio" name="px" id="px-cur" value="cur" checked> Onglet affiché : '+esc(cur)+' <small>— avec la recherche et les filtres en cours</small></label>'+
    '<label class="f c6 cb" for="px-all"><input type="radio" name="px" id="px-all" value="all"> Inventaire complet <small>— stock réel, labo / démo et attente livraison, avec la valeur nette</small></label></div>'+
    '<div class="act"><button class="btn" id="px-cancel" type="button">Annuler</button><button class="btn primary" id="px-ok" type="button">Créer le PDF</button></div>',
  function(){ $("px-cancel").onclick=closePanel; $("px-ok").onclick=function(){ var sc=$("px-all").checked?"all":"cur"; closePanel(); exportPdf(sc); }; });
});

/* ---------- événements ---------- */
document.addEventListener("click",function(e){
  var t=e.target.closest?e.target:null; if(!t) return;
  var tab=t.closest("[data-tab]"); if(tab){ S.tab=tab.dataset.tab; S.cat=""; keep(); render(); return; }
  var ch=t.closest("[data-cat]"); if(ch){ S.cat=ch.dataset.cat; render(); return; }
  var so=t.closest("th[data-sort]"); if(so){ var k=so.dataset.sort; if(S.sort===k) S.dir=-S.dir; else { S.sort=k; S.dir=1; } render(); return; }
  var b=t.closest("button[data-a]"); if(b){ var it=find(b.closest("tr").dataset.id); if(!it) return;
    var a=b.dataset.a; if(a==="edit") editPanel(it); else if(a==="move") movePanel(it); else qtyPanel(it,a); }
});
document.addEventListener("change",function(e){
  var t=e.target;
  if(t.id==="showEmpty"){ S.empty=t.checked; keep(); render(); return; }
  if(t.id==="onlyUnchk"){ S.unchk=t.checked; render(); return; }
  if(t.classList&&t.classList.contains("vchk")){
    var it=find(t.closest("tr").dataset.id); if(!it) return;
    var v=t.checked, d=v?today():null; it.verifie=v; it.verifie_le=d; renderChips();
    updItem(it.id,{verifie:v,verifie_le:d}).then(function(){ saveCache(); },function(err){ it.verifie=!v; render(); fail(err); });
  }
});
var resetArm=0;
document.addEventListener("click",function(e){
  if(!e.target||e.target.id!=="resetChk") return;
  var b=e.target;
  if(!resetArm||Date.now()-resetArm>4000){ resetArm=Date.now(); b.textContent="Confirmer : tout décocher ("+LOC[S.tab]+")"; return; }
  resetArm=0;
  sb.from("stk_articles").update({verifie:false,verifie_le:null}).eq("org_id",org.id).eq("loc",S.tab).eq("verifie",true).then(ok).then(function(){ load(); msg("Coches remises à zéro pour « "+LOC[S.tab]+" »."); },fail);
});
$("q").addEventListener("input",function(){ S.q=this.value; render(); });
$("addBtn").addEventListener("click",function(){ if(org) editPanel(null); });
function showDefs(){ $("defpct").value=cfg.pct; $("defpctS").value=cfg.pctStock; }
showDefs();
[["defpct","pct","labo"],["defpctS","pctStock","stock réel"]].forEach(function(x){ $(x[0]).addEventListener("change",function(){
  var v=Math.max(0,Math.min(100,num(this.value))); this.value=v; if(!org||v===cfg[x[1]]) return;
  cfg[x[1]]=v; render();
  sb.from("stk_config").upsert({org_id:org.id,pct:cfg.pct,pct_stock:cfg.pctStock}).then(ok).then(function(){ saveCache(); msg("Taux par défaut "+x[2]+" : "+NUM.format(v)+" %."); },fail);
}); });

/* ---------- utilisateurs ---------- */
function usersPanel(){
  var adm=role==="admin";
  openPanel('<h2>Utilisateurs</h2><div class="sub2">Accès au stock '+esc(org.nom)+'. Votre rôle : '+esc(ROLES[role])+'.</div><div id="u-list" class="ulist"><p class="hint">Chargement…</p></div>'+
    (adm?'<div class="invite"><span class="lab">Inviter quelqu’un</span><p class="hint">La personne ouvre l’app, crée son compte, puis saisit ce code. Elle arrive en <b>lecture seule</b> ; changez son rôle ici ensuite.</p>'+
      '<div class="coderow"><span class="code mono" id="u-code">'+esc(org.code||"")+'</span><button class="btn sm" id="u-copy" type="button">Copier l’invitation</button><button class="btn sm" id="u-new" type="button">Nouveau code</button></div>'+
      '<textarea id="u-txt" class="mono" rows="3" readonly hidden></textarea><p class="hint" id="u-msg"></p></div>':'')+
    '<div class="fg" style="margin-top:14px"><div class="f c4"><label class="lab" for="u-prenom">Mon prénom</label><input type="text" id="u-prenom" value="'+esc(org.prenom||"")+'"></div></div>'+
    '<p class="hint" style="margin-top:12px">Rôles : <b>Administrateur</b> peut '+ROLE_TXT.admin+' ; <b>Membre</b> peut '+ROLE_TXT.membre+' ; <b>Lecture seule</b> peut '+ROLE_TXT.lecteur+'.</p>'+
    '<div class="act"><button class="btn danger" id="u-leave" type="button">Quitter ce stock</button><span class="grow"></span><button class="btn primary" id="u-close" type="button">Fermer</button></div>',
  function(){
    $("u-close").onclick=closePanel;
    function inviteTxt(){ return "Accès au stock "+org.nom+" : "+location.origin+location.pathname+"\nCréez votre compte, puis saisissez le code d’invitation : "+org.code; }
    function list(){
      sb.rpc("stk_membres_liste",{o:org.id}).then(function(r){
        if(r.error){ $("u-list").innerHTML='<p class="err">'+esc(r.error.message)+'</p>'; return; }
        $("u-list").innerHTML='<table class="utab"><thead><tr><th class="nos">Nom</th><th class="nos">Rôle</th>'+(adm?'<th class="nos">Dernière connexion</th><th class="nos"></th>':'')+'</tr></thead><tbody>'+
          r.data.map(function(u){ var self=u.user_id===me.id;
            return '<tr data-u="'+esc(u.user_id)+'"><td class="des">'+esc(u.prenom||(u.email||"—"))+(self?' <span class="tag st">vous</span>':'')+(u.email&&u.prenom?'<small>'+esc(u.email)+'</small>':'')+'</td>'+
              '<td data-l="Rôle">'+(adm?'<select class="u-role" aria-label="Rôle">'+Object.keys(ROLES).map(function(k){ return '<option value="'+k+'"'+(k===u.role?" selected":"")+'>'+ROLES[k]+'</option>'; }).join("")+'</select>':esc(ROLES[u.role]))+'</td>'+
              (adm?'<td class="dt" data-l="Dernière connexion">'+(u.derniere_connexion?fd(u.derniere_connexion.slice(0,10)):"jamais")+'</td><td class="act">'+(self?'':'<button class="btn sm danger u-del" type="button">Retirer</button>')+'</td>':'')+'</tr>'; }).join("")+'</tbody></table>';
      });
    }
    list();
    $("u-list").addEventListener("change",function(e){
      if(!e.target.classList.contains("u-role")) return;
      var u=e.target.closest("tr").dataset.u, v=e.target.value;
      sb.rpc("stk_changer_role",{o:org.id,u:u,r:v}).then(ok).then(function(){ msg("Rôle modifié."); if(u===me.id){ setRole(v); showApp(); render(); } list(); },function(err){ fail(err); list(); });
    });
    $("u-list").addEventListener("click",function(e){
      var b=e.target.closest(".u-del"); if(!b) return;
      if(!b.classList.contains("armed")){ b.classList.add("armed"); b.textContent="Confirmer"; return; }
      sb.rpc("stk_retirer",{o:org.id,u:b.closest("tr").dataset.u}).then(ok).then(function(){ msg("Accès retiré."); list(); },fail);
    });
    if(adm){
      $("u-copy").onclick=function(){ var t=inviteTxt(), x=$("u-txt");
        (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ $("u-msg").textContent="Invitation copiée : collez-la dans un e-mail ou un message."; },function(){ x.hidden=false; x.value=t; x.select(); $("u-msg").textContent="Copiez le texte ci-dessus."; }); };
      var armN=false; $("u-new").onclick=function(){
        if(!armN){ armN=true; this.textContent="Confirmer : l’ancien code ne marchera plus"; return; }
        sb.rpc("stk_nouveau_code",{o:org.id}).then(ok).then(function(r){ org.code=r.data; saveCache(); $("u-code").textContent=r.data; armN=false; $("u-new").textContent="Nouveau code"; $("u-msg").textContent="Nouveau code actif."; },fail); };
    }
    $("u-prenom").onchange=function(){ var v=this.value; sb.rpc("stk_mon_prenom",{o:org.id,p:v}).then(ok).then(function(){ org.prenom=v; saveCache(); list(); },fail); };
    var armL=false; $("u-leave").onclick=function(){
      if(!armL){ armL=true; this.classList.add("armed"); this.textContent="Confirmer : je perds l’accès"; return; }
      sb.rpc("stk_retirer",{o:org.id,u:me.id}).then(ok).then(function(){ try{ localStorage.removeItem(CACHE); }catch(e){} location.reload(); },fail); };
  });
}
$("usersBtn").addEventListener("click",function(){ if(org) usersPanel(); });

/* ---------- données ---------- */
var CACHE="stock-cache";
function norm(o){ o=Object.assign({},o); o.verifie=!!o.verifie; o.qty=+o.qty||0; o.pu=+o.pu||0; o.pct=o.pct==null?null:+o.pct; o.dateIn=o.date_in; if(!LOC[o.loc]) o.loc="stock"; return o; }
function normM(m){ return {date:m.date,type:m.type,ref:m.ref,des:m.des,qty:+m.qty||0,from:m.from_loc,to:m.to_loc,value:m.value==null?null:+m.value,client:m.client,note:m.note}; }
function saveCache(){ try{ localStorage.setItem(CACHE,JSON.stringify({uid:me&&me.id,org:org,role:role,items:items,moves:moves,pct:cfg.pct,pctStock:cfg.pctStock})); }catch(e){} }
var loading=null;
function load(){
  if(loading) return loading;
  loading=Promise.all([
    sb.from("stk_articles").select("*").order("ref"),
    sb.from("stk_mouvements").select("*").order("created_at",{ascending:false}).limit(500),
    sb.from("stk_config").select("*").eq("org_id",org.id).maybeSingle()
  ]).then(function(r){
    var err=r.filter(function(x){return x.error;})[0];
    if(err){ msg("Chargement impossible : "+err.error.message,true); return; }
    items=r[0].data.map(norm); moves=r[1].data.map(normM);
    if(r[2].data){ cfg.pct=+r[2].data.pct; cfg.pctStock=+(r[2].data.pct_stock||0); } showDefs();
    ready=true; saveCache(); render();
  },function(){ msg("Pas de réseau : données affichées depuis le dernier chargement.",true); }).then(function(){ loading=null; });
  return loading;
}
var ROLES={admin:"Administrateur",membre:"Membre",lecteur:"Lecture seule"};
var ROLE_TXT={admin:"tout modifier et gérer les utilisateurs",membre:"consulter et modifier le stock",lecteur:"consulter et exporter, sans rien modifier"};
function setRole(r){ role=r||"lecteur"; writable=role!=="lecteur"; ["defpct","defpctS"].forEach(function(k){ $(k).disabled=!writable; }); }
function showApp(){ $("auth").hidden=true; $("app").hidden=false; $("who").textContent=me.email+" · "+(ROLES[role]||"")+(org?" · "+org.nom:""); render(); }
function start(session){
  if(me&&me.id===session.user.id&&org) return;
  me=session.user;
  try{ var c=JSON.parse(localStorage.getItem(CACHE)||"null"); if(c&&c.uid===me.id&&c.org){ org=c.org; setRole(c.role); items=c.items||[]; moves=c.moves||[]; if(c.pct!=null) cfg.pct=c.pct; if(c.pctStock!=null) cfg.pctStock=c.pctStock; showDefs(); ready=true; showApp(); } }catch(e){}
  sb.from("stk_membres").select("role,prenom,org:stk_orgs(*)").eq("user_id",me.id).limit(1).then(function(r){
    if(r.error){ if(!org) authMsg("Pas de réseau."); return; }
    if(!r.data.length){ org=null; showJoin(); return; }
    org=r.data[0].org; setRole(r.data[0].role); org.prenom=r.data[0].prenom; saveCache(); showApp(); load();
  });
}
/* ---------- connexion ---------- */
var mode="login";
function authMsg(t){ $("authErr").textContent=t||""; }
function showLogin(){ $("app").hidden=true; $("auth").hidden=false; $("joinF").hidden=true; $("authForm").hidden=false; setMode(mode); }
function setMode(m){
  mode=m; authMsg("");
  $("authPwF").hidden=m==="forgot"; $("authEmailF").hidden=m==="newpw";
  $("authGo").textContent={login:"Se connecter",signup:"Créer mon compte",forgot:"Recevoir le lien",newpw:"Enregistrer le mot de passe"}[m];
  $("authAlt").textContent=m==="login"?"Créer un compte":"J’ai déjà un compte";
  $("authForgot").hidden=m!=="login";
  $("authPw").autocomplete=m==="login"?"current-password":"new-password";
}
$("authAlt").onclick=function(){ setMode(mode==="login"?"signup":"login"); };
$("authForgot").onclick=function(){ setMode("forgot"); };
$("authForm").addEventListener("submit",function(e){
  e.preventDefault(); authMsg("");
  var email=$("authEmail").value.trim(), pw=$("authPw").value, back=location.origin+location.pathname, btn=$("authGo"); btn.disabled=true;
  var p;
  if(mode==="login") p=sb.auth.signInWithPassword({email:email,password:pw});
  else if(mode==="signup") p=sb.auth.signUp({email:email,password:pw,options:{emailRedirectTo:back}}).then(function(r){ if(!r.error&&!r.data.session) authMsg("Compte créé : confirmez-le avec le lien reçu par e-mail, puis connectez-vous."); return r; });
  else if(mode==="forgot") p=sb.auth.resetPasswordForEmail(email,{redirectTo:back}).then(function(r){ if(!r.error) authMsg("Lien envoyé : ouvrez l’e-mail sur cet appareil."); return r; });
  else p=sb.auth.updateUser({password:pw}).then(function(r){ if(!r.error){ mode="login"; sb.auth.getSession().then(function(x){ if(x.data.session) start(x.data.session); }); } return r; });
  p.then(function(r){ btn.disabled=false; if(r&&!r.error&&r.data&&r.data.session&&(mode==="login"||mode==="signup")) start(r.data.session); if(r&&r.error) authMsg(r.error.message==="Invalid login credentials"?"E-mail ou mot de passe incorrect.":r.error.message); },function(err){ btn.disabled=false; authMsg(err.message); });
});
function showJoin(){ $("app").hidden=true; $("auth").hidden=false; $("authForm").hidden=true; $("joinF").hidden=false; }
$("joinGo").onclick=function(){
  var code=$("joinCode").value.trim(); if(!code) return;
  sb.rpc("stk_rejoindre",{p_code:code,p_prenom:$("joinPrenom").value.trim()||null}).then(function(r){
    if(r.error){ $("joinErr").textContent=r.error.message; return; }
    me=null;
    sb.auth.getSession().then(function(x){ start(x.data.session); });
  });
};
$("joinOut").onclick=$("logout").onclick=function(){ sb.auth.signOut().then(function(){ try{ localStorage.removeItem(CACHE); }catch(e){} location.reload(); }); };
document.addEventListener("visibilitychange",function(){ if(!document.hidden&&me&&org) load(); });
sb.auth.onAuthStateChange(function(ev,session){ if(ev==="PASSWORD_RECOVERY"){ setMode("newpw"); showLogin(); } else if(ev==="SIGNED_IN"&&session&&!me) setTimeout(function(){ start(session); },0); });
sb.auth.getSession().then(function(r){ if(r.data.session&&mode!=="newpw") start(r.data.session); else showLogin(); });
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function(){});
})();
