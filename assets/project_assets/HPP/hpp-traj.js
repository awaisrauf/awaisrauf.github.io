/* HPP trajectory viewer. Renders exported reasoning traces (see tools/export_trajectory.py).
 *   HPPTraj.mountList(el, baseUrl)                    a thumbnail per trajectory; the selected one is shown in full
 *   HPPTraj.mountTeaser(el, baseUrl, id, href, opts)  question, answer, video and step map of one trajectory;
 *                                                     a step links to href#id/step (opts.question: a shorter question)
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
  const LETTERS = "ABCDEF";
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEV = '<svg class="ht-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

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
  /* a video's length in words: "16-min video", "1-hour video" */
  const length = (t) => (t < 55 * 60 ? `${Math.round(t / 60)}-min video` : `${+(t / 3600).toFixed(1)}-hour video`);
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
  const finalOf = (s) => (!s.blocks.length && /FINAL\(([^)]*)\)/.exec(s.text || "")) || null;

  /* what a step mainly did: its colour (the same as its marks) and a short label */
  function stepRole(s) {
    if (!s.blocks.length) return finalOf(s) ? ["answer", "Answer"] : ["think", "Reason"];
    const calls = new Set(s.blocks.flatMap((b) => b.calls));
    const vlm = s.blocks.flatMap((b) => b.vlm);
    const has = (...cs) => cs.some((c) => calls.has(c));
    if (vlm.some((v) => v.clip)) return ["vlm", "VLM watches a clip"];
    if (vlm.length) return ["vlm", has("zoom") ? "Zoom in + VLM" : has("search_in_shots", "search_in_scenes") ? "Search + VLM"
      : has("get_overview") ? "Overview + VLM" : "VLM checks frames"];
    if (has("zoom")) return ["frames", "Zoom into a shot"];
    if (has("get_clip")) return ["frames", "Cut clips"];
    if (has("search_in_shots", "search_in_scenes")) return ["search", "Semantic search"];
    if (has("find_times", "search_subtitles")) return ["subtitle", "Search subtitles"];
    if ([...calls].some((c) => KIND[c] === "structure")) return ["structure", "Read structure"];
    if (has("summarize_subtitles", "get_subtitles")) return ["subtitle", "Read subtitles"];
    if ([...calls].some((c) => KIND[c] === "frames")) return ["frames", "Sample frames"];
    return ["think", "Reason in code"];
  }

  /* ── question, answer, video and the step map, on one grid ───── */
  function renderMap(d, base, opts) {
    const T = d.video.duration || 1;
    const pct = (t) => `${Math.min(100, Math.max(0, (100 * t) / T)).toFixed(3)}%`;
    const wid = (a, b) => `${Math.max(0, (100 * (b - a)) / T).toFixed(3)}%`;
    const card = h("div", { class: "ht" + (opts.flat ? " flat" : "") });
    const row = (label, cls, tag, attrs) => {
      const r = card.appendChild(h(tag || "div", Object.assign({ class: "ht-row " + cls }, attrs)));
      r.appendChild(h("div", { class: "ht-lab" }, label));
      return r;
    };

    const q = (opts.question || d.question).trim(), cut = q.lastIndexOf(" ");
    row("Question", "ht-qa").appendChild(h("p", { class: "ht-q" },
      `${esc(q.slice(0, cut))} <span class="nw">${esc(q.slice(cut + 1))}&nbsp;<span class="len">·&nbsp;${length(T)}</span></span>`));
    const opt = d.options[LETTERS.indexOf(d.prediction)];
    const clips = d.steps.flatMap((s) => s.blocks.flatMap((b) => b.vlm.filter((v) => v.clip))).length;
    const seen = `<b>${d.stats.frames_seen}</b>`;
    row("Answer", "ht-qa").appendChild(h("div", { class: "ht-arow" },
      `<span class="ht-ans${d.correct ? "" : " no"}">${d.correct ? CHECK : CROSS}${esc(d.prediction)}) ${esc(opt ?? "")}</span>` +
      `<span class="ht-stat">VLM inspected ${clips ? `${seen} frames and ${clips} clip${clips > 1 ? "s" : ""}`
        : `${seen} of ${d.video.frames.toLocaleString("en-US")} frames`}</span>`));
    card.appendChild(h("div", { class: "ht-rule" }));

    const strip = row("Video", "ht-video").appendChild(h("div", { class: "ht-strip" }));
    d.filmstrip.forEach((f) => strip.appendChild(h("img", { src: base + f.src, alt: "", loading: "lazy", title: fmtTime(f.t) })));
    const axis = row("Trajectory", "ht-axisrow").appendChild(h("div", { class: "ht-axis" }));
    for (let i = 0; i <= 4; i++) axis.appendChild(h("span", { style: `left:${i * 25}%` }, fmtTime((T * i) / 4)));

    const used = new Set();
    const mark = (track, kind, style, title, data) => {
      used.add(kind);
      track.appendChild(h("div", Object.assign({ class: `mk ${kind}`, style, title }, data)));
    };
    d.steps.forEach((s, i) => {
      const [kind, label] = stepRole(s);
      const link = opts.stepHref ? { href: opts.stepHref(i) } : { role: "button", tabindex: "0" };
      const lane = row(`<span class="ht-n">${i + 1}</span><span class="ht-name">${label}</span>${opts.expandable ? CHEV : ""}`,
        `ht-step k-${kind}`, opts.stepHref ? "a" : "div", Object.assign({ "aria-label": `Step ${i + 1}: ${label}` }, link,
          opts.expandable ? { "aria-expanded": "false" } : {}));
      const track = lane.appendChild(h("div", { class: "ht-track" }));
      const kinds = stepKinds(s).map((c) => KIND[c]);
      const spans = s.blocks.flatMap((b) => b.spans);
      if (kinds.includes("structure") && !spans.some((x) => x.kind !== "subtitle"))
        mark(track, "structure", "left:1%;width:98%", "whole-video structure (shots / scenes)");
      if (kinds.includes("subtitle") && !spans.some((x) => x.kind === "subtitle"))
        mark(track, "structure", "left:1%;width:98%", "subtitle overview");
      for (const sp of spans) {
        const point = sp.t1 - sp.t0 < T / 400;
        const title = `${sp.kind}: ${fmtTime(sp.t0)}${point ? "" : "–" + fmtTime(sp.t1)}${sp.label ? " · " + sp.label : ""}`;
        mark(track, sp.kind, sp.kind === "subtitle" ? `left:${pct(sp.t0)}` : `left:${pct(sp.t0)};width:${wid(sp.t0, sp.t1)}`, title);
      }
      s.blocks.forEach((b) => b.vlm.forEach((v) => v.frames.forEach((f) =>
        mark(track, "vlm", `left:${pct(f.t)}`, "", { "data-src": base + f.src, "data-cap": `Step ${i + 1} · ${fmtTime(f.t)}` }))));
      const fin = finalOf(s);
      if (fin) track.appendChild(h("div", { class: "ht-final" }, `FINAL(${esc(fin[1].replace(/["'\s]/g, ""))})`));
      if (opts.onStep) {
        lane.addEventListener("click", () => opts.onStep(i));
        lane.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onStep(i); } });
      }
    });

    const legend = row("", "ht-legendrow").appendChild(h("div", { class: "ht-legend" }));
    LEGEND.filter(([k]) => used.has(k)).forEach(([k, label]) => legend.appendChild(h("span", {}, `<i class="${k}"></i>${label}`)));

    /* hovering a frame the VLM saw shows it */
    const tip = card.appendChild(h("div", { class: "ht-tip", "aria-hidden": "true" }));
    card.addEventListener("mouseover", (e) => {
      const m = e.target.closest(".mk.vlm");
      if (!m) { tip.classList.remove("on"); return; }
      tip.innerHTML = `<img src="${m.dataset.src}" alt=""><span>${esc(m.dataset.cap)}</span>`;
      const r = m.getBoundingClientRect(), c = card.getBoundingClientRect(), half = 90;
      tip.style.left = `${Math.min(c.width - half, Math.max(half, r.left + r.width / 2 - c.left))}px`;
      tip.style.top = `${r.top - c.top}px`;
      tip.classList.add("on");
    });
    card.addEventListener("mouseleave", () => tip.classList.remove("on"));
    return card;
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
  function stepBody(d, s, base) {
    const el = h("div", { class: "ht-detail-body" });
    const calls = stepKinds(s);
    if (calls.length || s.seconds)
      el.appendChild(h("div", { class: "ht-detail-meta" },
        `<span class="ht-chips">${chips(calls)}</span><span class="ht-secs">${s.seconds ? `${s.seconds.toFixed(0)} s` : ""}</span>`));
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
    const fin = finalOf(s);
    if (fin) {
      const letter = fin[1].replace(/["'\s]/g, "");
      const opt = d.options[LETTERS.indexOf(letter)];
      el.appendChild(h("div", { class: "tv-final" }, `FINAL(${esc(letter)})${opt ? `<span>${esc(opt)}</span>` : ""}${d.correct ? "<span>✓ correct</span>" : ""}`));
    }
    return el;
  }

  /* ── one trajectory: the map, each step opening in place under its row ── */
  function renderExample(d, base, n) {
    const sec = h("article", { class: "tx" });
    const all = h("button", { class: "tx-all", type: "button" }, "Expand all steps");
    sec.appendChild(h("div", { class: "tx-head" }, `<span class="tx-n">${n}</span><h2 class="tx-title">${esc(d.title)}</h2>`)).appendChild(all);
    const body = sec.appendChild(h("div", { class: "tx-body" }));
    const map = body.appendChild(renderMap(d, base, { flat: true, expandable: true, onStep: (i) => toggle(i) }));
    const lanes = [...map.querySelectorAll(".ht-step")];
    const panels = lanes.map((lane, i) => {
      const p = h("div", { class: `ht-detail k-${stepRole(d.steps[i])[0]}`, id: `${d.id}-${i + 1}`, hidden: "" });
      lane.after(p);
      return p;
    });
    const sync = () => { all.textContent = panels.every((p) => !p.hidden) ? "Collapse all steps" : "Expand all steps"; };
    function toggle(i, open) {
      const p = panels[i];
      if (!p) return;
      open = open ?? p.hidden;
      if (open && !p.firstChild) p.appendChild(stepBody(d, d.steps[i], base)); // built on first open
      p.hidden = !open;
      lanes[i].setAttribute("aria-expanded", String(open));
      sync();
    }
    all.addEventListener("click", () => { const open = panels.some((p) => p.hidden); panels.forEach((_, i) => toggle(i, open)); });
    const openStep = (i) => {
      const lane = lanes[i];
      if (!lane) return;
      toggle(i, true);
      lane.scrollIntoView({ block: "start", behavior: "smooth" });
      lane.classList.add("flash"); setTimeout(() => lane.classList.remove("flash"), 1500);
    };
    return { sec, openStep };
  }

  /* ── thumbnails of every trajectory; the selected one below ──── */
  async function mountList(el, base) {
    const manifest = await load(base + "manifest.json");
    const thumbs = h("nav", { class: "tx-thumbs", "aria-label": "Videos" });
    const links = {};
    manifest.forEach((m, k) => {
      links[m.id] = thumbs.appendChild(h("a", { class: "tx-thumb", href: `#${m.id}`, title: m.title },
        `<span class="tx-frame"><img src="${base + m.thumb}" alt="" loading="lazy"><span class="tx-thumb-n">${k + 1}</span>` +
        `<svg class="tx-play" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)"/><path d="M9.5 7.5l7 4.5-7 4.5z" fill="#fff"/></svg>` +
        `<span class="tx-dur">${fmtTime(m.duration)}</span></span><span class="tx-thumb-t">${esc(m.title)}</span>`));
    });
    const view = h("div", { class: "tx-view", "aria-live": "polite" });
    el.append(thumbs, view);

    let cur = null, ex = null;
    async function show(id, step) {
      if (id !== cur) {
        cur = id;
        for (const [k, a] of Object.entries(links)) {
          a.classList.toggle("on", k === id);
          if (k === id) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
        }
        const d = await load(`${base}${id}.json`);
        if (cur !== id) return; // another video was picked meanwhile
        ex = renderExample(d, base, manifest.findIndex((m) => m.id === id) + 1);
        view.replaceChildren(ex.sec);
      }
      if (step) ex.openStep(step - 1);
    }
    const go = () => {
      const [id, step] = decodeURIComponent(location.hash.slice(1)).split("/");
      return show(links[id] ? id : manifest[0].id, parseInt(step, 10) || 0);
    };
    window.addEventListener("hashchange", go);
    await go();
  }

  /* ── teaser: one trajectory's map; each step links to it on the trajectories page ── */
  async function mountTeaser(el, base, id, href, opts) {
    const d = await load(`${base}${id}.json`);
    el.appendChild(renderMap(d, base, Object.assign({ stepHref: (i) => `${href}#${id}/${i + 1}` }, opts)));
  }

  window.HPPTraj = { mountList, mountTeaser, load };
})();
