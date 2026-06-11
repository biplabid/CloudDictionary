const osiLayers = [
  { id: 7, name: "Application", hint: "APIs, SaaS, identity, analytics, management" },
  { id: 6, name: "Presentation", hint: "Encoding, encryption, serialization, formats" },
  { id: 5, name: "Session", hint: "Connections, sessions, auth exchanges" },
  { id: 4, name: "Transport", hint: "TCP, UDP, ports, load balancing, reliability" },
  { id: 3, name: "Network", hint: "IP, routing, VPCs, DNS, gateways" },
  { id: 2, name: "Data Link", hint: "Subnets, interfaces, private links, frames" },
  { id: 1, name: "Physical", hint: "Regions, zones, hardware, facilities" },
];

const providers = ["AWS", "GCP", "Azure"];
const providerNames = {
  AWS: "Amazon Web Services",
  GCP: "Google Cloud",
  Azure: "Microsoft Azure",
};

const data = window.CLOUD_GLOSSARY_DATA || { dictionary: {}, sources: {} };
const state = {
  provider: "AWS",
  query: "",
  type: "All",
  selected: null,
  layerFilter: null,
};

const providerTabs = document.querySelector("#providerTabs");
const osiList = document.querySelector("#osiList");
const activeLayerCount = document.querySelector("#activeLayerCount");
const sourceLink = document.querySelector("#sourceLink");
const searchInput = document.querySelector("#searchInput");
const typeFilter = document.querySelector("#typeFilter");
const clearButton = document.querySelector("#clearButton");
const statsRow = document.querySelector("#statsRow");
const resultsTitle = document.querySelector("#resultsTitle");
const resultsCount = document.querySelector("#resultsCount");
const resultsList = document.querySelector("#resultsList");
const detailPanel = document.querySelector("#detailPanel");

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function entries(provider = state.provider) {
  return data.dictionary?.[provider] || [];
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function searchableText(item) {
  return [
    item.term,
    item.type,
    item.definition,
    item.whenToUse,
    item.pricing,
    ...(item.aliases || []),
    ...(item.finops || []),
  ]
    .join(" ")
    .toLowerCase();
}

function rank(item, query) {
  if (!query) return 1;
  const term = normalize(item.term);
  const aliases = (item.aliases || []).map(normalize);
  if (term === query || aliases.includes(query)) return 100;
  if (term.startsWith(query)) return 80;
  if (term.includes(query)) return 55;
  return searchableText(item).includes(query) ? 20 : 0;
}

function filteredEntries() {
  const query = normalize(state.query);
  return entries()
    .map((item) => ({ item, score: rank(item, query) }))
    .filter(({ item, score }) => {
      const queryMatch = query ? score > 0 : true;
      const typeMatch = state.type === "All" || item.type === state.type;
      const layerMatch = !state.layerFilter || (item.layers || []).includes(state.layerFilter);
      return queryMatch && typeMatch && layerMatch;
    })
    .sort((a, b) => b.score - a.score || a.item.term.localeCompare(b.item.term))
    .map(({ item }) => item);
}

function getSelectedLayers() {
  return new Set((state.selected?.layers || []).map(Number));
}

function renderProviderTabs() {
  providerTabs.innerHTML = providers
    .map((provider) => {
      const active = provider === state.provider ? " active" : "";
      return `<button class="tab-button${active}" type="button" role="tab" aria-selected="${provider === state.provider}" data-provider="${provider}">${provider}</button>`;
    })
    .join("");
}

function renderTypeFilter() {
  const types = Array.from(new Set(entries().map((item) => item.type).filter(Boolean))).sort();
  typeFilter.innerHTML = [`<option value="All">All categories</option>`, ...types.map((type) => `<option value="${html(type)}">${html(type)}</option>`)].join("");
  typeFilter.value = types.includes(state.type) ? state.type : "All";
  state.type = typeFilter.value;
}

function renderStats() {
  const all = entries();
  const layerCoverage = new Set(all.flatMap((item) => item.layers || []));
  const pricingCount = all.filter((item) => item.type === "Pricing and FinOps" || /price|cost|billing|saving|reserved|commit/i.test(searchableText(item))).length;
  const source = data.sources?.[state.provider];
  sourceLink.textContent = source?.label || `${state.provider} reference`;
  sourceLink.href = source?.url || "#";

  statsRow.innerHTML = [
    ["Terms", all.length.toLocaleString()],
    ["Categories", new Set(all.map((item) => item.type)).size.toLocaleString()],
    ["OSI layers", layerCoverage.size.toString()],
    ["Cost topics", pricingCount.toLocaleString()],
  ]
    .map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderOsi() {
  const activeLayers = getSelectedLayers();
  const providerItems = entries();
  const countByLayer = new Map(osiLayers.map((layer) => [layer.id, 0]));
  providerItems.forEach((item) => (item.layers || []).forEach((layer) => countByLayer.set(layer, (countByLayer.get(layer) || 0) + 1)));

  const activeCount = activeLayers.size;
  activeLayerCount.textContent = activeCount ? `${activeCount} highlighted` : "No layer selected";
  osiList.innerHTML = osiLayers
    .map((layer) => {
      const highlighted = activeLayers.has(layer.id) ? " highlighted" : "";
      const filtered = state.layerFilter === layer.id ? " filtered" : "";
      return `
        <button class="layer-button${highlighted}${filtered}" type="button" data-layer="${layer.id}" title="Filter by layer ${layer.id}">
          <span class="layer-number">${layer.id}</span>
          <span class="layer-copy">
            <strong>${html(layer.name)}</strong>
            <small>${html(layer.hint)}</small>
          </span>
          <span class="layer-count">${countByLayer.get(layer.id) || 0}</span>
        </button>
      `;
    })
    .join("");
}

function renderResults() {
  const results = filteredEntries();
  resultsTitle.textContent = `${state.provider} dictionary`;
  resultsCount.textContent = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"}`;

  if (!results.includes(state.selected)) {
    state.selected = results[0] || entries()[0] || null;
  }

  resultsList.innerHTML = results.length
    ? results
        .slice(0, 80)
        .map((item) => {
          const active = item === state.selected ? " active" : "";
          const layers = (item.layers || []).map((layer) => `<span>L${layer}</span>`).join("");
          return `
            <button class="result-item${active}" type="button" data-term="${html(item.term)}">
              <span class="result-top">
                <strong>${html(item.term)}</strong>
                <small>${layers}</small>
              </span>
              <span>${html(item.type || "Cloud term")}</span>
            </button>
          `;
        })
        .join("")
    : `<div class="empty-state"><strong>No matches in ${html(state.provider)}.</strong><span>Try another term, category, or OSI layer.</span></div>`;
}

function renderDetail() {
  if (!state.selected) {
    detailPanel.innerHTML = `<div class="empty-state"><strong>No dictionary item selected.</strong><span>Select a provider or change the search.</span></div>`;
    return;
  }

  const item = state.selected;
  const source = item.source || data.sources?.[state.provider]?.url || "#";
  const layers = (item.layers || [])
    .map((id) => {
      const layer = osiLayers.find((entry) => entry.id === Number(id));
      return `<span class="layer-pill">L${id} ${html(layer?.name || "Layer")}</span>`;
    })
    .join("");

  detailPanel.innerHTML = `
    <div class="detail-header">
      <div>
        <span class="eyebrow">${html(providerNames[state.provider])}</span>
        <h3>${html(item.term)}</h3>
      </div>
      <span class="type-pill">${html(item.type || "Cloud term")}</span>
    </div>

    <div class="layer-pills">${layers || `<span class="layer-pill">No OSI layer mapped</span>`}</div>

    <section class="detail-section">
      <h4>Definition</h4>
      <p>${html(item.definition || "No definition is available for this entry.")}</p>
    </section>

    <section class="detail-section">
      <h4>When to use</h4>
      <p>${html(item.whenToUse || "Use this term when designing, operating, securing, or optimizing the related cloud capability.")}</p>
    </section>

    <section class="detail-section">
      <h4>Pricing strategy</h4>
      <p>${html(item.pricing || "Review the provider pricing page for region, meter, free tier, commitment, and support-plan effects.")}</p>
    </section>

    <section class="detail-section">
      <h4>FinOps strategy</h4>
      <ul>${(item.finops || []).map((point) => `<li>${html(point)}</li>`).join("") || "<li>Assign ownership, tag usage, monitor spend, and review utilization regularly.</li>"}</ul>
    </section>

    ${
      item.aliases?.length
        ? `<section class="detail-section compact"><h4>Also known as</h4><p>${item.aliases.map(html).join(", ")}</p></section>`
        : ""
    }

    <a class="source-link" href="${html(source)}" target="_blank" rel="noreferrer">Open provider source</a>
  `;
}

function render() {
  renderProviderTabs();
  renderTypeFilter();
  renderStats();
  renderResults();
  renderOsi();
  renderDetail();
}

function selectProvider(provider) {
  state.provider = provider;
  state.query = "";
  state.type = "All";
  state.layerFilter = null;
  state.selected = entries(provider)[0] || null;
  searchInput.value = "";
  render();
}

providerTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-provider]");
  if (button) selectProvider(button.dataset.provider);
});

osiList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-layer]");
  if (!button) return;
  const layer = Number(button.dataset.layer);
  state.layerFilter = state.layerFilter === layer ? null : layer;
  renderResults();
  renderOsi();
  renderDetail();
});

resultsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-term]");
  if (!button) return;
  state.selected = filteredEntries().find((item) => item.term === button.dataset.term) || state.selected;
  renderResults();
  renderOsi();
  renderDetail();
});

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderResults();
  renderOsi();
  renderDetail();
});

typeFilter.addEventListener("change", (event) => {
  state.type = event.target.value;
  renderResults();
  renderOsi();
  renderDetail();
});

clearButton.addEventListener("click", () => {
  state.query = "";
  state.type = "All";
  state.layerFilter = null;
  searchInput.value = "";
  render();
  searchInput.focus();
});

state.selected = entries(state.provider)[0] || null;
render();
