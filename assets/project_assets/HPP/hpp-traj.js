/* HPP trajectory viewer. Renders exported reasoning traces (see tools/export_trajectory.py).
 *   HPPTraj.mountList(el, baseUrl)              every trajectory on one page, each with an expandable step-by-step trace
 *   HPPTraj.mountTeaser(el, baseUrl, id, href)  legend + temporal map of one trajectory; a step links to href#id/step
 */
(function () {
  "use strict";

  const KIND = {
    get_video_info: "structure", get_shots: "structure", get_scenes: "structure",
    get_clusters: "structure", get_shot_detail: "structure",
    search_in_shots: "search", search_in_scenes: "search",
    summarize_subtitles: "subtitle", find_times: "subtitle", search_subtitles: "subtitle", get_subtitles: "subtitle",
    get_overview: "frames", sample: "frames", sample_shot: "frames", get_frames: "frames", get_frame_at: "frames",
    zoom: "zoom", get_clip: "clip", vlm_query: "vlm",
  };
  const LEGEND = [
    ["structure", "structure information"], ["subtitle", "subtitle hit"], ["search", "semantic search hit"],
    ["frames", "sampled frames"], ["zoom", "zoom"], ["clip", "clip"], ["vlm", "frame shown to the VLM"],
  ];
  const DATASET = { LongVideoBench: "LongVideoBench", VideoMME: "Video-MME", MLVU_all: "MLVU", MLVU: "MLVU", EgoSchema: "EgoSchema" };
  const LETTERS = "ABCDEF";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const h = (tag, attrs, html) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    if (html != null) el.innerHTML = html;
    return el;
  };
  const fmtTime = (t) => {
    t = Math.max(0, Math.round(t));
    const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = String(t % 60).padStart(2, "0");
    return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
  };
  const fmtDur = (t) => (t >= 3600 ? `${(t / 3600).toFixed(1)} h` : `${Math.round(t / 60)} min`);
  const ds = (d) => DATASET[d] || d || "";
  const cache = {};
  const load = (url) => (cache[url] = cache[url] || fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); }));

  /* ── python highlighting ─────────────────────────────────────── */
  const FN = Object.keys(KIND).join("|");
  const TOK = new RegExp(
    String.raw`(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|[rfbu]{0,2}"(?:\\.|[^"\\\n])*"|[rfbu]{0,2}'(?:\\.|[^'\\\n])*')` +
    String.raw`|\b(\d+(?:\.\d+)?)\b|\b(def|return|for|in|if|elif|else|while|import|from|as|and|or|not|None|True|False|try|except|with|lambda|break|continue|is|pass)\b` +
    String.raw`|\b(${FN})\b(?=\s*\()`, "g");
  function highlight(code) {
    let out = "", last = 0;
    code.replace(TOK, (m, c, s, n, k, f, i) => {
      out += esc(code.slice(last, i));
      const cls = c ? "c" : s ? "s" : n ? "n" : k ? "k" : "f";
      out += `<span class="${cls}">${esc(m)}</span>`;
      last = i + m.length;
      return m;
    });
    return out + esc(code.slice(last));
  }

  /* what the LLM said it was doing: the comments it wrote in its code */
  function intents(block) {
    const paras = [];
    for (const raw of block.code.split("\n")) {
      const m = raw.match(/^\s*#\s*(.+)$/);
      if (!m) continue;
      let t = m[1].replace(/^(step|turn)\s*\d+\s*[:.\-—]\s*/i, "").replace(/^\d+[).]\s*/, "").trim();
      if (/^[-=─#*]+$/.test(t)) continue;
      const prev = paras[paras.length - 1];
      if (prev && !/[.:!?]$/.test(prev) && /^[a-z(]/.test(t)) paras[paras.length - 1] = prev + " " + t; // continuation
      else if (t.length >= 12) paras.push(t[0].toUpperCase() + t.slice(1));
      if (paras.length > 3) break;
    }
    return paras.slice(0, 3);
  }

  function stepKinds(step) {
    const set = new Set();
    step.blocks.forEach((b) => b.calls.forEach((c) => set.add(c)));
    return [...set];
  }
  const chips = (calls) => calls.map((c) => `<span class="chip ${KIND[c] || ""}">${esc(c)}</span>`).join("");

  /* ── legend + temporal map ───────────────────────────────────── */
  const renderLegend = () => h("div", { class: "tmap-legend" },
    LEGEND.map(([k, label]) => `<span><i class="${k}" style="background:var(--k-${k})"></i>${label}</span>`).join(""));

  function renderMap(root, d, onLane) {
    const T = d.video.duration || 1;
    const pct = (t) => `${Math.min(100, Math.max(0, (100 * t) / T)).toFixed(3)}%`;
    const wid = (a, b) => `${Math.max(0, (100 * (b - a)) / T).toFixed(3)}%`;
    const map = h("div", { class: "tmap", role: "group", "aria-label": "Where each step probed the video" });

    const strip = h("div", { class: "tmap-strip" });
    d.filmstrip.forEach((f) => strip.appendChild(h("img", { src: root.base + f.src, alt: "", loading: "lazy", title: fmtTime(f.t) })));
    const r1 = h("div", { class: "tmap-row" }, `<div class="tmap-label"><span class="lw">video</span></div>`);
    r1.appendChild(strip);
    map.appendChild(r1);

    const axis = h("div", { class: "tmap-axis" });
    for (let i = 0; i <= 4; i++) axis.appendChild(h("span", { style: `left:${i * 25}%` }, fmtTime((T * i) / 4)));
    const r2 = h("div", { class: "tmap-row" }, `<div></div>`);
    r2.appendChild(axis);
    map.appendChild(r2);

    d.steps.forEach((s, i) => {
      const track = h("div", { class: "tmap-track" });
      const kinds = stepKinds(s).map((c) => KIND[c]);
      const spans = s.blocks.flatMap((b) => b.spans);
      if (kinds.includes("structure") && !spans.some((x) => x.kind !== "subtitle"))
        track.appendChild(h("div", { class: "mk structure", style: `left:0;width:100%`, title: "whole-video structure (shots / scenes)" }));
      if (kinds.includes("subtitle") && !spans.some((x) => x.kind === "subtitle"))
        track.appendChild(h("div", { class: "mk structure", style: `left:0;width:100%`, title: "subtitle overview" }));
      for (const sp of spans) {
        const point = sp.t1 - sp.t0 < T / 400;
        const title = `${sp.kind}: ${fmtTime(sp.t0)}${point ? "" : "–" + fmtTime(sp.t1)}${sp.label ? " · " + sp.label : ""}`;
        const style = sp.kind === "subtitle" ? `left:${pct(sp.t0)}` : `left:${pct(sp.t0)};width:${wid(sp.t0, sp.t1)}`;
        track.appendChild(h("div", { class: `mk ${sp.kind}`, style, title }));
      }
      s.blocks.forEach((b) => b.vlm.forEach((v) => v.frames.forEach((f) =>
        track.appendChild(h("div", { class: "mk vlm", style: `left:${pct(f.t)}`, title: `VLM frame ${fmtTime(f.t)}` })))));
      if (!track.children.length && s.blocks.length) track.appendChild(h("span", { class: "tmap-note" }, "reasoning in code"));
      const fin = /FINAL\(([^)]*)\)/.exec(s.text || "");
      if (fin && !s.blocks.length) track.appendChild(h("div", { class: "tmap-final" }, `FINAL(${esc(fin[1].replace(/["']/g, ""))})`));
      const lane = h("div", { class: "tmap-row tmap-lane", "data-step": i, title: `Step ${i + 1}` },
        `<div class="tmap-label"><span class="lw">step </span>${i + 1}</div>`);
      lane.appendChild(track);
      if (onLane) lane.addEventListener("click", () => onLane(i));
      map.appendChild(lane);
    });
    return map;
  }

  /* ── one VLM call ────────────────────────────────────────────── */
  function renderVlm(v, base) {
    const box = h("div", { class: "tv-vlm" });
    box.appendChild(h("div", { class: "tv-vlm-head" },
      v.clip ? `VLM · video clip ${fmtTime(v.clip.t0)}–${fmtTime(v.clip.t1)}` : `VLM · ${v.n_images} frame${v.n_images === 1 ? "" : "s"}`));
    const frames = v.clip ? v.clip.frames : v.frames;
    if (frames.length) {
      const grid = h("div", { class: "tv-frames" });
      frames.forEach((f) => {
        const fig = h("figure", {}, `<img src="${base + f.src}" alt="frame at ${fmtTime(f.t)}" loading="lazy"><figcaption>${fmtTime(f.t)}</figcaption>`);
        fig.querySelector("img").addEventListener("click", () => lightbox(base + f.src, fmtTime(f.t)));
        grid.appendChild(fig);
      });
      if (!v.clip && v.n_images > frames.length) grid.appendChild(h("div", { class: "more" }, `+${v.n_images - frames.length} more`));
      box.appendChild(grid);
    }
    box.appendChild(h("p", { class: "tv-q" }, `<b>LLM asks:</b> ${esc(v.prompt)}`));
    const a = h("p", { class: "tv-a clamp" }, `<b class="lbl">VLM:</b> ${esc(v.response)}`);
    box.appendChild(a);
    if (v.response.length > 380) {
      const more = h("button", { class: "tv-more", type: "button" }, "Show full answer");
      more.addEventListener("click", () => { const c = a.classList.toggle("clamp"); more.textContent = c ? "Show full answer" : "Show less"; });
      box.appendChild(more);
    }
    return box;
  }

  function lightbox(src, cap) {
    const lb = h("div", { class: "tv-lightbox", role: "dialog", "aria-label": "Frame" }, `<img src="${src}" alt=""><div>${esc(cap)}</div>`);
    const close = () => { lb.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    lb.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(lb);
  }

  /* ── one step: what the LLM wrote, what came back, what the VLM saw ── */
  function renderStep(d, s, i, base) {
    const box = h("div", { class: "tx-step", id: `${d.id}-${i + 1}` });
    const calls = stepKinds(s);
    box.appendChild(h("div", { class: "tv-step-head" },
      `<span class="tx-step-n">Step ${i + 1}</span>` + (calls.length ? chips(calls) : "") +
      (s.seconds ? `<span class="time">${s.seconds.toFixed(0)} s</span>` : "")));
    const el = box.appendChild(h("div", { class: "tx-step-body" }));
    const said = (s.text || "").replace(/FINAL\([^)]*\)/, "").trim();
    if (said) el.appendChild(h("div", { class: "tv-intent" }, `<p>${esc(said)}</p>`));
    s.blocks.forEach((b) => {
      const blk = h("div", { class: "tv-block" });
      const it = intents(b);
      if (it.length) blk.appendChild(h("div", { class: "tv-intent" }, it.map((t) => `<p>${esc(t)}</p>`).join("")));
      blk.appendChild(h("details", { class: "tv-fold" }, `<summary>Code · ${b.code.split("\n").length} lines</summary><pre class="tv-pre">${highlight(b.code)}</pre>`));
      const out = (b.stdout || "").trim() + (b.stderr ? `\n[stderr] ${b.stderr}` : "");
      if (out) blk.appendChild(h("details", { class: "tv-fold" }, `<summary>REPL output</summary><pre class="tv-pre">${esc(out)}</pre>`));
      b.vlm.forEach((v) => blk.appendChild(renderVlm(v, base)));
      el.appendChild(blk);
    });
    const fin = /FINAL\(([^)]*)\)/.exec(s.text || "");
    if (fin && !s.blocks.length) {
      const letter = fin[1].replace(/["'\s]/g, "");
      const opt = d.options[LETTERS.indexOf(letter)];
      el.appendChild(h("div", { class: "tv-final" }, `FINAL(${esc(letter)})${opt ? `<span>${esc(opt)}</span>` : ""}${d.correct ? "<span>✓ correct</span>" : ""}`));
    }
    return box;
  }

  /* ── one trajectory: question, answer, map, and the expandable step-by-step trace ── */
  function renderExample(d, base, n) {
    const sec = h("section", { class: "tx", id: d.id });
    sec.appendChild(h("div", { class: "tx-head" }, `<span class="tx-n">${n}</span><h2 class="tx-title">${esc(d.title)}</h2>`));
    const body = sec.appendChild(h("div", { class: "tx-body" }));
    body.appendChild(h("p", { class: "tx-qa" }, `<b>Q:</b> ${esc(d.question)}`));
    const pi = LETTERS.indexOf(d.prediction);
    body.appendChild(h("p", { class: "tx-qa" },
      `<b>A:</b> ${esc(d.prediction)}) ${esc(d.options[pi] ?? "")}` + (d.correct ? ` <span class="tx-ok">✓ correct</span>` : "")));

    const traj = h("details", { class: "tx-traj" }, `<summary>Trajectory · ${d.steps.length} steps</summary>`);
    const list = h("div", { class: "tx-steps" });
    const stepEls = d.steps.map((s, i) => list.appendChild(renderStep(d, s, i, base)));
    traj.appendChild(list);
    const openStep = (i) => {
      if (i < 0 || i >= stepEls.length) return;
      traj.open = true;
      const el = stepEls[i];
      el.scrollIntoView({ block: "start" });
      el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1500);
    };
    body.append(renderMap({ base }, d, openStep), traj);
    return { sec, openStep };
  }

  /* ── all trajectories on one page ────────────────────────────── */
  async function mountList(el, base) {
    const manifest = await load(base + "manifest.json");
    const data = await Promise.all(manifest.map((m) => load(`${base}${m.id}.json`)));
    const byId = {};
    const thumbs = h("nav", { class: "tx-thumbs", "aria-label": "Examples" });
    manifest.forEach((m, k) => {
      const a = h("a", { class: "tx-thumb", href: `#${m.id}`, title: m.title },
        `<span class="tx-frame"><img src="${base + m.thumb}" alt="" loading="lazy"><span class="tx-thumb-n">${k + 1}</span>` +
        `<svg class="tx-play" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)"/><path d="M9.5 7.5l7 4.5-7 4.5z" fill="#fff"/></svg>` +
        `<span class="tx-dur">${fmtTime(m.duration)}</span></span><span class="tx-thumb-t">${esc(m.title)}</span>`);
      a.addEventListener("click", (e) => {
        e.preventDefault();
        history.replaceState(null, "", `#${m.id}`);
        byId[m.id].sec.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      thumbs.appendChild(a);
    });
    el.appendChild(thumbs);
    el.appendChild(h("div", { class: "tx-legend" })).appendChild(renderLegend());
    data.forEach((d, k) => {
      const ex = renderExample(d, base, k + 1);
      byId[d.id] = ex;
      el.appendChild(ex.sec);
    });
    const go = () => {
      const [id, step] = decodeURIComponent(location.hash.slice(1)).split("/");
      const ex = byId[id];
      if (!ex) return;
      if (step) ex.openStep(parseInt(step, 10) - 1); else ex.sec.scrollIntoView({ block: "start" });
    };
    window.addEventListener("hashchange", go);
    go();
  }

  /* ── teaser: legend + map, each step links to it on the trajectories page ── */
  async function mountTeaser(el, base, id, href) {
    const d = await load(`${base}${id}.json`);
    el.appendChild(renderLegend());
    el.appendChild(renderMap({ base }, d, (i) => { location.href = `${href}#${id}/${i + 1}`; }));
  }

  window.HPPTraj = { mountList, mountTeaser, load };
})();
