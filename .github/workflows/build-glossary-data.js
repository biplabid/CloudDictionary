const fs = require("fs");

const sources = {
  AWS: {
    file: "aws-glossary.html",
    url: "https://docs.aws.amazon.com/glossary/latest/reference/glos-chap.html",
    label: "AWS Glossary Reference",
  },
  GCP: {
    file: "gcp-products.html",
    url: "https://cloud.google.com/products",
    label: "Google Cloud Products",
  },
  Azure: {
    file: "azure-products.html",
    url: "https://azure.microsoft.com/en-us/products/",
    label: "Azure Products",
  },
};

function decodeHtml(value) {
  return value
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<li[^>]*>/gi, " ")
      .replace(/<\/p>|<\/div>|<\/li>|<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function uniqueByTerm(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.term.toLowerCase();
    if (!entry.term || !entry.definition || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferLayers(term, definition) {
  const text = `${term} ${definition}`.toLowerCase();
  const layers = new Set();

  if (/(api|application|app|service|database|query|analytics|machine learning|ai|identity|iam|policy|billing|cost|monitor|log|backup|deployment|pipeline|container|kubernetes|serverless|function|queue|notification|workflow|email|search)/.test(text)) {
    layers.add(7);
  }
  if (/(ssl|tls|certificate|encryption|encrypt|key|secret|token|compression|encoding|format)/.test(text)) {
    layers.add(6);
  }
  if (/(session|authentication|federation|single sign-on|sso|login|credential|principal|role|user)/.test(text)) {
    layers.add(5);
  }
  if (/(tcp|udp|port|load balancer|load balancing|proxy|endpoint|connection|traffic|http|https|grpc)/.test(text)) {
    layers.add(4);
  }
  if (/(network|vpc|vnet|subnet|route|router|dns|ip address|ipv4|ipv6|firewall|gateway|vpn|nat|peering|interconnect|direct connect|expressroute|cdn|edge)/.test(text)) {
    layers.add(3);
  }
  if (/(mac|ethernet|nic|interface|link|switch|vlan|attachment)/.test(text)) {
    layers.add(2);
  }
  if (/(region|zone|availability zone|data center|datacenter|hardware|disk|server|host|physical|gpu|tpu|quantum)/.test(text)) {
    layers.add(1);
  }

  if (!layers.size) layers.add(7);
  return [...layers].sort((a, b) => b - a);
}

function inferType(term, definition, provider) {
  const text = `${term} ${definition}`.toLowerCase();
  if (/(pricing|billing|cost|budget|reservation|reserved|savings|discount|spot|commitment|finops|tco)/.test(text)) return "Pricing and FinOps";
  if (/(identity|iam|role|policy|permission|access|authentication|mfa|certificate|secret|key vault|kms|defender|security|firewall|waf|shield)/.test(text)) return "Security and identity";
  if (/(vpc|vnet|network|subnet|route|dns|load balancer|gateway|vpn|nat|cdn|front door|interconnect|direct connect|expressroute|traffic)/.test(text)) return "Networking";
  if (/(database|sql|nosql|spanner|bigquery|cosmos|dynamodb|aurora|rds|postgres|mysql|redis|cache|warehouse)/.test(text)) return "Data and databases";
  if (/(storage|bucket|blob|disk|file|backup|archive|snapshot|object)/.test(text)) return "Storage and backup";
  if (/(kubernetes|container|docker|ecs|eks|gke|aks|cloud run|container apps|fargate)/.test(text)) return "Containers";
  if (/(compute|virtual machine|vm|instance|serverless|function|lambda|app service|app engine|ec2)/.test(text)) return "Compute";
  if (/(monitor|logging|cloudwatch|trail|audit|observability|metric|alarm|alert|trace)/.test(text)) return "Observability and operations";
  if (/(pipeline|deploy|build|code|devops|cloudformation|template|terraform|infrastructure)/.test(text)) return "DevOps and automation";
  if (/(ai|machine learning|ml|model|vertex|bedrock|sage|cognitive|openai|copilot)/.test(text)) return "AI and machine learning";
  return `${provider} glossary term`;
}

function inferPricing(term, type, provider) {
  const text = `${term} ${type}`.toLowerCase();
  if (/pricing|billing|cost|budget|reservation|reserved|savings|discount|spot|commitment/.test(text)) {
    return "Review the provider billing page for the exact commercial model. Treat this term as part of commitment, allocation, forecasting, or cost-control strategy.";
  }
  if (/storage|backup|archive|snapshot|bucket|blob|disk|file/.test(text)) {
    return "Typical cost drivers include stored capacity, access tier, operations or requests, replication, retention, retrieval, and data transfer.";
  }
  if (/network|load balancer|gateway|vpn|cdn|traffic|dns|firewall/.test(text)) {
    return "Typical cost drivers include hourly resources, processed data, requests, public IPs, rules or policies, and cross-zone, cross-region, or internet transfer.";
  }
  if (/database|sql|nosql|warehouse|cache|analytics/.test(text)) {
    return "Typical cost drivers include compute capacity, storage, I/O or requests, replicas, backups, licensing, query volume, and data transfer.";
  }
  if (/compute|container|kubernetes|serverless|function|vm|instance/.test(text)) {
    return "Typical cost drivers include vCPU or instance time, memory, accelerators, storage, requests, execution duration, commitments, and data transfer.";
  }
  if (/observability|operations|monitor|log|audit/.test(text)) {
    return "Typical cost drivers include ingestion, indexed volume, retention, scans, dashboards, alerts, and export destinations.";
  }
  return `Check ${provider} pricing documentation for the exact SKU, region, usage meter, and free-tier or commitment options.`;
}

function inferFinops(term, type) {
  const text = `${term} ${type}`.toLowerCase();
  if (/pricing|billing|cost|budget|reservation|reserved|savings|discount|spot|commitment/.test(text)) {
    return ["Track utilization and coverage.", "Review commitments monthly.", "Allocate spend with tags or labels.", "Use forecasts and anomaly alerts."];
  }
  if (/storage|backup|archive|snapshot|bucket|blob|disk|file/.test(text)) {
    return ["Apply lifecycle policies.", "Delete unattached or stale resources.", "Choose tiers by access pattern.", "Tag data owners and retention requirements."];
  }
  if (/network|load balancer|gateway|vpn|cdn|traffic|dns|firewall/.test(text)) {
    return ["Monitor data transfer paths.", "Remove idle endpoints and rules.", "Keep traffic regional when possible.", "Review shared network appliance costs."];
  }
  if (/database|sql|nosql|warehouse|cache|analytics/.test(text)) {
    return ["Right-size compute and storage.", "Clean stale replicas and backups.", "Use commitments for steady workloads.", "Optimize queries and request patterns."];
  }
  if (/compute|container|kubernetes|serverless|function|vm|instance/.test(text)) {
    return ["Right-size CPU and memory.", "Schedule non-production shutdowns.", "Use autoscaling.", "Apply commitments only to measured baseline usage."];
  }
  if (/security|identity|access|policy|key|secret/.test(text)) {
    return ["Review unused permissions and credentials.", "Tag ownership.", "Avoid over-retaining audit data.", "Balance control coverage with per-resource charges."];
  }
  if (/observability|operations|monitor|log|audit/.test(text)) {
    return ["Set retention by data value.", "Reduce noisy logs and metrics.", "Use sampling where appropriate.", "Alert on ingestion spikes."];
  }
  return ["Assign an owner.", "Tag or label resources consistently.", "Review usage monthly.", "Document when the term or service should be used."];
}

function makeEntry(provider, term, definition, aliases = []) {
  const cleanTerm = term.replace(/\s+/g, " ").trim();
  const cleanDefinition = definition.replace(/\s+/g, " ").trim();
  const type = inferType(cleanTerm, cleanDefinition, provider);
  return {
    term: cleanTerm,
    type,
    layers: inferLayers(cleanTerm, cleanDefinition),
    aliases: [...new Set([cleanTerm.toLowerCase(), ...aliases.filter(Boolean).map((value) => value.toLowerCase())])].slice(0, 8),
    definition: cleanDefinition,
    whenToUse: `Use this ${provider} term when you need to understand, design, operate, secure, or optimize the related cloud capability or process.`,
    pricing: inferPricing(cleanTerm, type, provider),
    finops: inferFinops(cleanTerm, type),
    source: sources[provider].url,
  };
}

function parseAws() {
  const html = fs.readFileSync(sources.AWS.file, "utf8");
  const entries = [];
  const pattern = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const term = stripHtml(match[1]);
    const definition = stripHtml(match[2]).replace(/^See also\s+/i, "See also ");
    if (!term || !definition || /^[A-Z]$/.test(term) || term === "Numbers and symbols") continue;
    entries.push(makeEntry("AWS", term, definition));
  }
  return uniqueByTerm(entries).sort((a, b) => a.term.localeCompare(b.term));
}

function parseGcpProducts() {
  const html = fs.readFileSync(sources.GCP.file, "utf8");
  const entries = [];
  const pattern = /<a\b(?=[^>]*track-type="product-card")[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const card = match[1];
    const categoryMatch = card.match(/<div class="[^"]*w6Zsc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const nameMatch = card.match(/<div class="[^"]*owa4Ee[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const term = nameMatch ? stripHtml(nameMatch[1]) : "";
    const category = categoryMatch ? stripHtml(categoryMatch[1]) : "Google Cloud service";
    if (!term || term.length > 90) continue;
    const definition = `${term} is a Google Cloud product for ${category.toLowerCase()}.`;
    entries.push(makeEntry("GCP", term, definition, [category]));
  }
  const anchorPattern = /<a\b[^>]*href="https:\/\/cloud\.google\.com\/([^"?#]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const blockedPrefixes = /^(blog|contact|docs|support|terms|pricing|customers|partners|events|training|certification|why-google-cloud|resources|marketplace|free|contact-us|sitemap|_)/;
  const blockedWords = /^(overview|solutions|products|pricing|docs|support|contact us|learn more|see all|terms of service|google cloud sla)$/i;
  while ((match = anchorPattern.exec(html))) {
    const href = match[1].replace(/\/$/, "");
    const text = stripHtml(match[2]).replace(/\b(open_in_new|expand_content|arrow_forward)\b/g, "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 180 || blockedWords.test(text) || blockedPrefixes.test(href)) continue;
    if (/\/(overview|docs|quickstart|tutorial|pricing|contact|support|blog|case-studies|whitepapers)\b/.test(href)) continue;

    const term = inferGcpTermName(href, text);
    if (!term || term.length > 90 || blockedWords.test(term)) continue;
    const description = text === term ? `${term} is listed in the official Google Cloud product catalog.` : text;
    entries.push(makeEntry("GCP", term, description, [href.split("/").pop().replace(/-/g, " ")]));
  }
  return uniqueByTerm(entries).sort((a, b) => a.term.localeCompare(b.term));
}

function inferGcpTermName(href, text) {
  const special = {
    "products/compute": "Compute Engine",
    compute: "Compute Engine",
    bigquery: "BigQuery",
    run: "Cloud Run",
    sql: "Cloud SQL",
    storage: "Cloud Storage",
    "kubernetes-engine": "Google Kubernetes Engine",
    "products/gemini-enterprise-agent-platform": "Gemini Enterprise Agent Platform",
    apigee: "Apigee API Management",
    cdn: "Cloud CDN",
    appengine: "App Engine",
    gpu: "Cloud GPUs",
    functions: "Cloud Functions",
    pubsub: "Pub/Sub",
    spanner: "Spanner",
    firestore: "Firestore",
    memorystore: "Memorystore",
    dataproc: "Dataproc",
    dataflow: "Dataflow",
    dataplex: "Dataplex",
    composer: "Cloud Composer",
    "cloud-build": "Cloud Build",
    build: "Cloud Build",
    deploy: "Cloud Deploy",
    iam: "Cloud IAM",
    kms: "Cloud KMS",
    dns: "Cloud DNS",
    armor: "Cloud Armor",
    "secret-manager": "Secret Manager",
    "artifact-registry": "Artifact Registry",
    "contact-center-ai-platform": "Contact Center as a Service",
  };
  if (special[href]) return special[href];

  const last = href.split("/").filter(Boolean).pop();
  if (special[last]) return special[last];

  const words = text.split(/\s+/);
  const nameWords = [];
  for (const word of words) {
    const clean = word.replace(/[(),]/g, "");
    const looksName = /^[A-Z0-9][A-Za-z0-9+.-]*$/.test(clean) || /^(and|for|of|to|on|with|as|a|the|in|&)$/.test(clean);
    if (!looksName && nameWords.length >= 2) break;
    if (!looksName && nameWords.length < 2) continue;
    nameWords.push(word);
    if (nameWords.length >= 7) break;
  }
  const candidate = nameWords.join(" ").replace(/\s+/g, " ").trim();
  if (candidate && candidate.length >= 3 && !/^(AI and|Data and|See all|Learn)/i.test(candidate)) return candidate;

  return titleCaseSlug(last);
}

function titleCaseSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      const acronyms = { ai: "AI", api: "API", apis: "APIs", cdn: "CDN", dns: "DNS", gpu: "GPU", gpus: "GPUs", iam: "IAM", iot: "IoT", ml: "ML", sql: "SQL", tpu: "TPU", tpus: "TPUs", vm: "VM", vms: "VMs" };
      return acronyms[lower] || lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function parseAzureProducts() {
  const html = fs.readFileSync(sources.Azure.file, "utf8");
  const entries = [];
  const pattern = /<div class="card-body[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<p>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const term = stripHtml(match[1]);
    const definition = stripHtml(match[2]);
    if (!term || !definition || term.length > 100) continue;
    entries.push(makeEntry("Azure", term, definition));
  }
  return uniqueByTerm(entries).sort((a, b) => a.term.localeCompare(b.term));
}

const dictionary = {
  AWS: parseAws(),
  GCP: parseGcpProducts(),
  Azure: parseAzureProducts(),
};

const output = `window.CLOUD_GLOSSARY_DATA = ${JSON.stringify({ sources, dictionary }, null, 2)};\n`;
fs.writeFileSync("cloud-glossary-data.js", output);

console.log(`Generated cloud-glossary-data.js`);
console.log(`AWS: ${dictionary.AWS.length} glossary terms`);
console.log(`GCP: ${dictionary.GCP.length} product terms`);
console.log(`Azure: ${dictionary.Azure.length} product terms`);
