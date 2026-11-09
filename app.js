/* Stock Cevilog : stock réel, labo / démo avec dépréciation en %, attente livraison client.
   Données dans Supabase (projet mes-chats, tables stk_*), partagées avec les membres du foyer. */
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
var me=null, foyer=null, ready=false, writable=true;
var items=[], moves=[], cfg={pct:30};
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
function pctOf(i){ return isAm(i)?Math.max(0,Math.min(100,i.pct!=null?+i.pct:cfg.pct)):0; }
function dep(it){
  var cost=(it.qty||0)*(it.pu||0);
  if(it.loc!=="labo") return {cost:cost,cum:0,vnc:cost,pct:0};
  var p=pctOf(it), cum=Math.round(cost*p)/100;
  return {cost:cost,cum:cum,vnc:cost-cum,pct:p};
}
function unitVnc(it){ return dep(Object.assign({},it,{qty:1})).vnc; }

/* ---------- synthèse ---------- */
function renderSum(){
  var sv=0,lc=0,lv=0,lcum=0,av=0,n={stock:0,labo:0,attente:0},late=0,t=today();
  items.forEach(function(i){
    if(i.qty>0) n[i.loc]=(n[i.loc]||0)+1;
    if(i.loc==="stock") sv+=i.qty*i.pu;
    else if(i.loc==="attente"){ av+=i.qty*i.pu; if(i.qty>0&&i.eta&&i.eta<t) late++; }
    else if(i.loc==="labo"){ var d=dep(i); lc+=d.cost; lv+=d.vnc; lcum+=d.cum; }
  });
  $("n-stock").textContent=n.stock; $("n-labo").textContent=n.labo; $("n-attente").textContent=n.attente||"";
  $("sum").innerHTML=
    '<div><div class="k">Stock réel</div><div class="v">'+eur(sv)+'</div><div class="s">'+n.stock+' références · prix d’achat</div></div>'+
    '<div class="lb"><div class="k">Labo · valeur d’achat</div><div class="v">'+eur(lc)+'</div><div class="s">'+n.labo+' références</div></div>'+
    '<div class="neg"><div class="k">Dépréciation labo</div><div class="v">'+neg(lcum)+'</div><div class="s">'+(lc?NUM.format(Math.round(lcum/lc*1000)/10)+' % en moyenne':'—')+'</div></div>'+
    '<div><div class="k">Attente livraison</div><div class="v">'+eur(av)+'</div><div class="s">'+(n.attente||0)+' références'+(late?' · <span class="tag late">'+late+' en retard</span>':'')+'</div></div>'+
    '<div class="big"><div class="k">Valeur nette</div><div class="v">'+eur(sv+lv)+'</div><div class="s">stock + labo déprécié '+eur(lv)+'</div></div>';
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
  var tab=S.tab, labo=tab==="labo", att=tab==="attente", t=today();
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
function toRow(d){ var o={foyer_id:foyer.id}; ["ref","des","cat","brand","loc","qty","pu","amort","pct","client","eta","note"].forEach(function(k){ if(k in d) o[k]=d[k]===""?null:d[k]; }); if("dateIn" in d) o.date_in=d.dateIn||null; if(o.eta==="") o.eta=null; return o; }
function addItem(d){ return sb.from("stk_articles").insert(toRow(d)).then(ok); }
function setItem(id,d){ return sb.from("stk_articles").update(toRow(d)).eq("id",id).then(ok); }
function updItem(id,d){ return sb.from("stk_articles").update(d).eq("id",id).then(ok); }
function delItem(id){ return sb.from("stk_articles").delete().eq("id",id).then(ok); }
function log(m){ var row={foyer_id:foyer.id,user_id:me.id,date:m.date||today(),type:m.type,ref:m.ref,des:m.des,qty:m.qty,from_loc:m.from||null,to_loc:m.to||null,value:m.value==null?null:Math.round(m.value*100)/100,client:m.client||null,note:m.note||null};
  return sb.from("stk_mouvements").insert(row).then(ok).then(function(){ return load(); }); }
function clean(o){ var r={}; Object.keys(o).forEach(function(k){ if(["id","foyer_id","created_at","updated_at","date_in"].indexOf(k)<0) r[k]=o[k]; }); return r; }

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
    '<div class="f c2 dpl dpa"><label class="lab" for="e-pct">Dépréciation (%)</label><input type="number" id="e-pct" min="0" max="100" step="1" value="'+(it.pct!=null?it.pct:cfg.pct)+'"></div>'+
    '<div class="f c6 dpl dpa"><div class="prev" id="e-prev"></div></div>'+
    '<div class="f c6"><label class="lab" for="e-note">Note</label><input type="text" id="e-note" value="'+esc(it.note)+'" placeholder="N° de série, emplacement, état…"></div>'+
    '</div><div class="act">'+(isNew?"":'<button class="btn danger" id="e-del" type="button">Supprimer</button>')+'<span class="grow"></span><button class="btn" id="e-cancel" type="button">Annuler</button><button class="btn primary" id="e-save" type="button">Enregistrer</button></div>',
  function(){
    var amTouched=!isNew||it.amort!=null;
    function sync(){
      var loc=$("e-loc").value, labo=loc==="labo", amOn=$("e-am").checked;
      Array.prototype.forEach.call(document.querySelectorAll(".ap"),function(e){ e.hidden=loc!=="attente"; });
      Array.prototype.forEach.call(document.querySelectorAll(".dpl"),function(e){ e.hidden=!labo; });
      Array.prototype.forEach.call(document.querySelectorAll(".dpa"),function(e){ e.hidden=!(labo&&amOn); });
      if(!(labo&&amOn)) return;
      var d=dep({loc:"labo",amort:true,qty:num($("e-qty").value),pu:num($("e-pu").value),pct:num($("e-pct").value)});
      $("e-prev").innerHTML='Valeur d’achat <b>'+eur(d.cost)+'</b> − dépréciation <b>'+eur(d.cum)+'</b> = valeur nette <b>'+eur(d.vnc)+'</b>';
    }
    $("e-cat").addEventListener("change",function(){ if(!amTouched) $("e-am").checked=NOAM.indexOf(this.value)<0; sync(); });
    $("e-am").addEventListener("change",function(){ amTouched=true; sync(); });
    ["e-loc","e-qty","e-pu","e-pct"].forEach(function(k){ $(k).addEventListener("input",sync); $(k).addEventListener("change",sync); });
    sync();
    $("e-cancel").onclick=closePanel;
    $("e-save").onclick=function(){
      var ref=$("e-ref").value.trim(), des=$("e-des").value.trim();
      if(!ref&&!des){ $("e-ref").focus(); return; }
      var d={ref:ref,des:des,cat:$("e-cat").value,brand:$("e-brand").value.trim(),loc:$("e-loc").value,qty:num($("e-qty").value),pu:num($("e-pu").value),
        dateIn:$("e-date").value,amort:$("e-am").checked,note:$("e-note").value.trim(),client:null,eta:null,pct:null};
      if(d.loc==="labo"&&d.amort){ d.pct=Math.max(0,Math.min(100,num($("e-pct").value))); }
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
    '<div class="f c2 ml mla"><label class="lab" for="m-pct">Dépréciation (%)</label><input type="number" id="m-pct" min="0" max="100" step="1" value="'+(it.pct!=null?it.pct:cfg.pct)+'"></div>'+
    '<div class="f c3 ma"><label class="lab" for="m-client">Client</label><input type="text" id="m-client" value="'+esc(it.client)+'"></div>'+
    '<div class="f c3 ma"><label class="lab" for="m-eta">Livraison prévue</label><input type="date" id="m-eta" value="'+esc(it.eta||"")+'"></div>'+
    '<div class="f c6"><label class="lab" for="m-note">Note</label><input type="text" id="m-note" placeholder="Motif, salon, démo…"></div>'+
    '<div class="f c6"><div class="prev" id="m-prev"></div></div></div>'+
    '<div class="act"><button class="btn" id="m-cancel" type="button">Annuler</button><button class="btn primary" id="m-ok" type="button">Transférer</button></div>',
  function(){
    function pv(){
      var to=$("m-to").value, n=Math.min(it.qty,Math.max(1,Math.floor(num($("m-qty").value)))), date=$("m-date").value||today(), am=$("m-am").checked;
      Array.prototype.forEach.call(document.querySelectorAll(".ml"),function(e){ e.hidden=to!=="labo"; });
      Array.prototype.forEach.call(document.querySelectorAll(".mla"),function(e){ e.hidden=!(to==="labo"&&am); });
      Array.prototype.forEach.call(document.querySelectorAll(".ma"),function(e){ e.hidden=to!=="attente"; });
      var uv=unitVnc(it), t, p=Math.max(0,Math.min(100,num($("m-pct").value)));
      if(to==="labo") t=am?'Valeur d’achat <b>'+eur(n*it.pu)+'</b>, dépréciée de '+NUM.format(p)+' % : valeur nette <b>'+eur(n*it.pu*(1-p/100))+'</b>.':'Article non dépréciable : il reste au labo à <b>'+eur(n*it.pu)+'</b>.';
      else if(it.loc==="labo"&&uv!==it.pu) t='Repris à sa valeur dépréciée : <b>'+eur(uv)+'</b> / unité au lieu de '+eur(it.pu)+' (soit <b>'+eur(n*uv)+'</b>).';
      else t='Valeur transférée : <b>'+eur(n*it.pu)+'</b>.'+(to==="attente"?' Elle sort de la valeur nette jusqu’à la livraison.':'');
      $("m-prev").innerHTML=t;
    }
    ["m-to","m-qty","m-date","m-am","m-pct"].forEach(function(k){ $(k).addEventListener("input",pv); $(k).addEventListener("change",pv); }); pv();
    $("m-cancel").onclick=closePanel;
    $("m-ok").onclick=function(){
      var to=$("m-to").value, n=Math.floor(num($("m-qty").value)), date=$("m-date").value||today();
      if(n<1||n>it.qty){ $("m-qty").focus(); return; }
      var moved=clean(it); moved.qty=n; moved.loc=to; moved.ts=Date.now(); moved.client=null; moved.eta=null;
      if(it.loc==="labo"){ var uvd=unitVnc(it); if(uvd!==it.pu){ moved.note=[it.note,"Retour labo le "+fd(date)+" (PU d’origine "+eur(it.pu)+")"].filter(Boolean).join(" · "); moved.pu=Math.round(uvd*100)/100; } }
      moved.pct=null;
      if(to==="labo"){ moved.amort=$("m-am").checked; if(moved.amort) moved.pct=Math.max(0,Math.min(100,num($("m-pct").value))); }
      if(to==="attente"){ moved.client=$("m-client").value.trim(); moved.eta=$("m-eta").value||null; }
      this.disabled=true; var self=this;
      var p=n===it.qty?setItem(it.id,moved):updItem(it.id,{qty:it.qty-n}).then(function(){ return addItem(moved); });
      p.then(function(){ return log({type:"transfert",date:date,ref:it.ref,des:it.des,qty:n,from:it.loc,to:to,value:n*moved.pu,client:moved.client,note:$("m-note").value.trim()}); })
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
      if(out){ upd={qty:it.qty-n}; value=n*(it.loc==="labo"?unitVnc(it):it.pu); }
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
    var d=dep(i), f=function(n){ return (Math.round(n*100)/100).toFixed(2).replace(".",","); }, lb=i.loc==="labo", am=isAm(i);
    rows.push([LOCS[i.loc],i.ref,i.des,i.cat,i.brand,i.qty,f(i.pu),f(d.cost),lb?(am?"Oui":"Non"):"",lb&&am?String(d.pct).replace(".",","):"",f(d.cum),f(d.vnc),i.client,i.eta?fd(i.eta):"",i.verifie?fd(i.verifie_le):"",i.note]);
  });
  return "﻿"+rows.map(function(r){ return r.map(function(c){ c=String(c==null?"":c); return /[;"\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c; }).join(";"); }).join("\r\n");
}
$("csvBtn").addEventListener("click",function(){
  var u=URL.createObjectURL(new Blob([csv()],{type:"text/csv;charset=utf-8"})), a=document.createElement("a");
  a.href=u; a.download="Stock-Cevilog_"+today()+".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); },2000);
});
$("printBtn").addEventListener("click",function(){ window.print(); });

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
  sb.from("stk_articles").update({verifie:false,verifie_le:null}).eq("foyer_id",foyer.id).eq("loc",S.tab).eq("verifie",true).then(ok).then(function(){ load(); msg("Coches remises à zéro pour « "+LOC[S.tab]+" »."); },fail);
});
$("q").addEventListener("input",function(){ S.q=this.value; render(); });
$("addBtn").addEventListener("click",function(){ if(foyer) editPanel(null); });
$("defpct").value=cfg.pct;
$("defpct").addEventListener("change",function(){
  var v=Math.max(0,Math.min(100,num(this.value))); this.value=v; if(!foyer||v===cfg.pct) return;
  cfg.pct=v; render();
  sb.from("stk_config").upsert({foyer_id:foyer.id,pct:v}).then(ok).then(function(){ msg("Taux par défaut : "+NUM.format(v)+" %."); },fail);
});

/* ---------- données ---------- */
var CACHE="stock-cache";
function norm(o){ o=Object.assign({},o); o.verifie=!!o.verifie; o.qty=+o.qty||0; o.pu=+o.pu||0; o.pct=o.pct==null?null:+o.pct; o.dateIn=o.date_in; if(!LOC[o.loc]) o.loc="stock"; return o; }
function normM(m){ return {date:m.date,type:m.type,ref:m.ref,des:m.des,qty:+m.qty||0,from:m.from_loc,to:m.to_loc,value:m.value==null?null:+m.value,client:m.client,note:m.note}; }
function saveCache(){ try{ localStorage.setItem(CACHE,JSON.stringify({uid:me&&me.id,foyer:foyer,items:items,moves:moves,pct:cfg.pct})); }catch(e){} }
var loading=null;
function load(){
  if(loading) return loading;
  loading=Promise.all([
    sb.from("stk_articles").select("*").order("ref"),
    sb.from("stk_mouvements").select("*").order("created_at",{ascending:false}).limit(500),
    sb.from("stk_config").select("*").eq("foyer_id",foyer.id).maybeSingle()
  ]).then(function(r){
    var err=r.filter(function(x){return x.error;})[0];
    if(err){ msg("Chargement impossible : "+err.error.message,true); return; }
    items=r[0].data.map(norm); moves=r[1].data.map(normM);
    if(r[2].data){ cfg.pct=+r[2].data.pct; } $("defpct").value=cfg.pct;
    ready=true; saveCache(); render();
  },function(){ msg("Pas de réseau : données affichées depuis le dernier chargement.",true); }).then(function(){ loading=null; });
  return loading;
}
function showApp(){ $("auth").hidden=true; $("app").hidden=false; $("who").textContent=me.email; render(); }
function start(session){
  me=session.user;
  try{ var c=JSON.parse(localStorage.getItem(CACHE)||"null"); if(c&&c.uid===me.id&&c.foyer){ foyer=c.foyer; items=c.items||[]; moves=c.moves||[]; if(c.pct!=null) cfg.pct=c.pct; $("defpct").value=cfg.pct; ready=true; showApp(); } }catch(e){}
  sb.from("foyers").select("*").limit(1).then(function(r){
    if(r.error){ if(!foyer) authMsg("Pas de réseau."); return; }
    if(!r.data.length){ showJoin(); return; }
    foyer=r.data[0]; showApp(); load();
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
  p.then(function(r){ btn.disabled=false; if(r&&r.error) authMsg(r.error.message==="Invalid login credentials"?"E-mail ou mot de passe incorrect.":r.error.message); },function(err){ btn.disabled=false; authMsg(err.message); });
});
function showJoin(){ $("app").hidden=true; $("auth").hidden=false; $("authForm").hidden=true; $("joinF").hidden=false; }
$("joinGo").onclick=function(){
  var code=$("joinCode").value.trim(); if(!code) return;
  sb.rpc("rejoindre_foyer",{p_code:code,p_prenom:$("joinPrenom").value.trim()||null}).then(function(r){
    if(r.error){ $("joinErr").textContent=r.error.message; return; }
    sb.auth.getSession().then(function(x){ start(x.data.session); });
  });
};
$("joinOut").onclick=$("logout").onclick=function(){ sb.auth.signOut().then(function(){ try{ localStorage.removeItem(CACHE); }catch(e){} location.reload(); }); };
document.addEventListener("visibilitychange",function(){ if(!document.hidden&&me&&foyer) load(); });
sb.auth.onAuthStateChange(function(ev,session){ if(ev==="PASSWORD_RECOVERY"){ setMode("newpw"); showLogin(); } });
sb.auth.getSession().then(function(r){ if(r.data.session&&mode!=="newpw") start(r.data.session); else showLogin(); });
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function(){});
})();
