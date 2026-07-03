// Points at the GitHub-hosted copy so this local file always shows whatever
// the daily GitHub Action last committed, even if this PC was off at 5am.
// Falls back to the local file if the remote fetch fails (e.g. offline).
const REMOTE_DATA_URL = "https://raw.githubusercontent.com/RFKAnthony-1/News/main/data.json?t=" + Date.now();
const LOCAL_DATA_URL = "./data.json";

let activeCat = "closures";
let activeInst = "all";
let data = null;

const catRow = document.getElementById("cat-row");
const instRow = document.getElementById("inst-row");
const cardsEl = document.getElementById("cards");
const emptyEl = document.getElementById("empty");
const updatedEl = document.getElementById("updated");

function chip(label, active, onClick) {
  const b = document.createElement("button");
  b.className = "chip" + (active ? " active" : "");
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function renderChips() {
  catRow.innerHTML = "";
  data.categories.forEach((c) => {
    catRow.appendChild(chip(c.label, c.id === activeCat, () => {
      activeCat = c.id;
      renderChips();
      renderCards();
    }));
  });

  const instSet = [{ id: "all", label: "All institutions" }];
  const seen = new Set();
  data.stories.filter((s) => s.category === activeCat).forEach((s) => {
    if (!seen.has(s.inst)) {
      seen.add(s.inst);
      instSet.push({ id: s.inst, label: s.instLabel });
    }
  });

  instRow.innerHTML = "";
  instSet.forEach((i) => {
    instRow.appendChild(chip(i.label, i.id === activeInst, () => {
      activeInst = i.id;
      renderChips();
      renderCards();
    }));
  });
}

function renderCards() {
  const cat = data.categories.find((c) => c.id === activeCat);
  cardsEl.innerHTML = "";

  if (!cat.live) {
    cardsEl.style.display = "none";
    instRow.style.display = "none";
    emptyEl.style.display = "block";
    emptyEl.textContent = `No stories tracked for "${cat.label}" yet.`;
    return;
  }

  const filtered = data.stories.filter(
    (s) => s.category === activeCat && (activeInst === "all" || s.inst === activeInst)
  );

  if (filtered.length === 0) {
    cardsEl.style.display = "none";
    instRow.style.display = "flex";
    emptyEl.style.display = "block";
    emptyEl.textContent = "No recent stories matched this filter.";
    return;
  }

  cardsEl.style.display = "flex";
  instRow.style.display = "flex";
  emptyEl.style.display = "none";

  filtered.forEach((s) => {
    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "card-top";

    const badge = document.createElement("span");
    badge.className = "badge " + s.color;
    badge.textContent = s.instLabel;

    const date = document.createElement("span");
    date.className = "card-date";
    date.textContent = s.date;

    top.appendChild(badge);
    top.appendChild(date);

    const h = document.createElement("h3");
    const a = document.createElement("a");
    a.href = s.url;
    a.textContent = s.headline;
    a.target = "_blank";
    a.rel = "noopener";
    h.appendChild(a);

    const src = document.createElement("span");
    src.className = "source";
    src.textContent = s.source;

    card.appendChild(top);
    card.appendChild(h);
    card.appendChild(src);
    cardsEl.appendChild(card);
  });
}

function loadData(d) {
  data = d;
  const updated = new Date(d.updatedAt);
  updatedEl.textContent = "Updated " + updated.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  });
  renderChips();
  renderCards();
}

fetch(REMOTE_DATA_URL)
  .then((r) => {
    if (!r.ok) throw new Error("remote fetch failed: " + r.status);
    return r.json();
  })
  .then(loadData)
  .catch(() => {
    fetch(LOCAL_DATA_URL, { cache: "no-store" })
      .then((r) => r.json())
      .then(loadData)
      .catch((err) => {
        cardsEl.innerHTML = "";
        emptyEl.style.display = "block";
        emptyEl.textContent = "Couldn't load news data: " + err.message;
      });
  });
