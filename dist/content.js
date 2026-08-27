(() => {
  // src/utils.js
  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const match = cleanText(value).match(/-?\d[\d,]*/);
    if (!match) return null;
    const number = Number(match[0].replaceAll(",", ""));
    return Number.isFinite(number) ? number : null;
  }
  function normalizeUrl(value, baseUrl = "https://example.invalid/") {
    if (!value) return null;
    try {
      const url = new URL(value, baseUrl);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key))
          url.searchParams.delete(key);
      }
      return url.href;
    } catch {
      return null;
    }
  }
  function toIsoDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  function formatDate(value) {
    const iso = toIsoDate(value);
    return iso ? iso.slice(0, 10) : "\u2014";
  }
  function formatNumber(value) {
    return Number.isFinite(value) ? new Intl.NumberFormat("ko-KR").format(value) : "\u2014";
  }
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }
  function safeJsonParse(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  function uniqueBy(items, getKey) {
    const seen = /* @__PURE__ */ new Set();
    return items.filter((item) => {
      const key = getKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function logError(...args) {
    console.error("[Hayoung4]", ...args);
  }

  // src/posting-records.js
  var SEOUL_OFFSET_MS = 9 * 60 * 60 * 1e3;
  function seoulDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
  }
  function estimateGamejobModifiedDate(text, collectedAt) {
    const value = cleanText(text);
    if (!value) return null;
    const absolute = value.match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
    if (absolute) {
      return `${absolute[1]}-${absolute[2].padStart(2, "0")}-${absolute[3].padStart(2, "0")}`;
    }
    const collected = new Date(collectedAt);
    if (Number.isNaN(collected.getTime())) return null;
    const relative = value.match(/(\d+)\s*(분|시간|일)\s*전/);
    if (!relative) {
      if (/오늘/.test(value)) return seoulDateKey(collected);
      if (/어제/.test(value)) {
        return seoulDateKey(new Date(collected.getTime() - 24 * 60 * 60 * 1e3));
      }
      return null;
    }
    const amount = Number(relative[1]);
    const unitMs = {
      \uBD84: 60 * 1e3,
      \uC2DC\uAC04: 60 * 60 * 1e3,
      \uC77C: 24 * 60 * 60 * 1e3
    }[relative[2]];
    return seoulDateKey(new Date(collected.getTime() - amount * unitMs));
  }
  function normalizePostingTitle(title) {
    return cleanText(title).normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu, "");
  }
  function dateKey(value) {
    const match = cleanText(value).match(/20\d{2}-\d{2}-\d{2}/);
    return match?.[0] ?? null;
  }
  function sixMonthsAfter(value) {
    const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 6);
    return date.toISOString().slice(0, 10);
  }
  function maxSixMonthCount(items) {
    const dates = items.map((item) => dateKey(item.deadline)).filter(Boolean).sort();
    let maximum = 0;
    let left = 0;
    for (let right = 0; right < dates.length; right += 1) {
      while (dates[right] > sixMonthsAfter(dates[left])) left += 1;
      maximum = Math.max(maximum, right - left + 1);
    }
    return maximum;
  }
  function descendingDate(left, right, getDate) {
    const leftDate = getDate(left) ?? "";
    const rightDate = getDate(right) ?? "";
    return rightDate.localeCompare(leftDate);
  }
  function sortPastPostings(postings, siteId) {
    const getDate = siteId === "gamejob" ? (posting) => posting.modifiedDate ?? posting.lastModifiedAt : (posting) => posting.deadline;
    return [...postings].sort(
      (left, right) => descendingDate(left, right, getDate) || cleanText(left.title).localeCompare(cleanText(right.title), "ko-KR")
    );
  }
  function createJobkoreaDuplicateGroups(postings) {
    const groups = /* @__PURE__ */ new Map();
    for (const posting of postings) {
      const key = normalizePostingTitle(posting.title);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(posting);
    }
    return [...groups.entries()].map(([normalizedTitle, items]) => {
      const sortedItems = sortPastPostings(items, "jobkorea");
      return {
        ...sortedItems[0],
        normalizedTitle,
        duplicateCount: sortedItems.length,
        sixMonthDuplicateCount: maxSixMonthCount(sortedItems),
        duplicateItems: sortedItems
      };
    }).filter((group) => group.duplicateCount >= 2).sort(
      (left, right) => descendingDate(left, right, (posting) => posting.deadline)
    );
  }
  function getPostingModifiedDate(posting) {
    return posting?.modifiedDate ?? dateKey(posting?.lastModifiedAt) ?? null;
  }
  function getPostingUrlKey(value) {
    const text = cleanText(value);
    if (!text) return null;
    try {
      const url = new URL(text, "https://hayoung.invalid");
      const host = url.hostname.toLocaleLowerCase("en-US");
      const path = url.pathname.replace(/\/+$/, "").toLocaleLowerCase("en-US");
      if (/gamejob\.co\.kr$/.test(host) && /\/gi_read\/view$/.test(path)) {
        const postingId = [...url.searchParams].find(
          ([key]) => key.toLocaleLowerCase("en-US") === "gi_no"
        )?.[1];
        return postingId ? `${host}${path}?gi_no=${postingId}` : `${host}${path}`;
      }
      return `${host}${path}`;
    } catch {
      return text;
    }
  }
  function isPostingUnavailable({
    savedPosting,
    loadedPostings,
    hasMore
  }) {
    if (hasMore !== false) return false;
    const savedUrl = getPostingUrlKey(savedPosting?.url);
    if (!savedUrl) return true;
    return !(loadedPostings ?? []).some(
      (posting) => getPostingUrlKey(posting?.url) === savedUrl
    );
  }

  // src/sites/shared.js
  function flattenJsonLd(value) {
    if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
    if (!value || typeof value !== "object") return [];
    return value["@graph"] ? [value, ...flattenJsonLd(value["@graph"])] : [value];
  }
  function readJsonLd(document2) {
    const values = [];
    for (const script of document2.querySelectorAll(
      'script[type="application/ld+json"]'
    )) {
      try {
        values.push(...flattenJsonLd(JSON.parse(script.textContent)));
      } catch {
      }
    }
    return values;
  }
  function findJsonLd(document2, type) {
    return readJsonLd(document2).find((item) => {
      const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
      return types.includes(type);
    });
  }
  function firstText(document2, selectors) {
    for (const selector of selectors) {
      const value = cleanText(document2.querySelector(selector)?.textContent);
      if (value) return value;
    }
    return null;
  }
  function firstAttribute(document2, selectors, attribute) {
    for (const selector of selectors) {
      const value = cleanText(
        document2.querySelector(selector)?.getAttribute(attribute)
      );
      if (value) return value;
    }
    return null;
  }
  function labeledText(document2, labels) {
    const normalizedLabels = labels.map((label) => cleanText(label));
    const candidates = document2.querySelectorAll("dt, th, strong, b, span, div");
    for (const element of candidates) {
      const label = cleanText(element.textContent);
      if (!normalizedLabels.includes(label)) continue;
      const sibling = element.nextElementSibling;
      const siblingValue = cleanText(sibling?.textContent);
      if (siblingValue) return siblingValue;
      const parentText = cleanText(element.parentElement?.textContent);
      const withoutLabel = cleanText(parentText.replace(label, ""));
      if (withoutLabel) return withoutLabel;
    }
    return null;
  }
  function labeledNumber(document2, labels) {
    return parseNumber(labeledText(document2, labels));
  }
  function normalizePageDate(value) {
    if (!value) return null;
    const normalized = cleanText(value).replace(/[.년]/g, "-").replace(/월/g, "-").replace(/일/g, "");
    const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match)
      return toIsoDate(
        `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00+09:00`
      );
    return toIsoDate(value);
  }
  function derivePostingStatus({
    documentText,
    deadline,
    closedPatterns = [],
    openPatterns = []
  }) {
    const text = cleanText(documentText);
    if (closedPatterns.some((pattern) => pattern.test(text))) return "closed";
    if (openPatterns.some((pattern) => pattern.test(text))) return "open";
    const deadlineDate = deadline ? new Date(deadline) : null;
    if (deadlineDate && !Number.isNaN(deadlineDate.getTime())) {
      return deadlineDate.getTime() < Date.now() ? "closed" : "open";
    }
    return "unknown";
  }
  function createCompany({ site, externalId, name, url }) {
    if (!name) return null;
    const stableExternalId = externalId || cleanText(name).toLowerCase().replace(/\s+/g, "-");
    return {
      id: `${site}:${stableExternalId}`,
      site,
      externalId: externalId || null,
      name: cleanText(name),
      url: url || null
    };
  }

  // src/request-scheduler.js
  var DEFAULT_MIN_INTERVAL_MS = 1e3;
  function createOriginRequestScheduler({
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    now = () => Date.now(),
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  } = {}) {
    const queues = /* @__PURE__ */ new Map();
    const lastStartedAt = /* @__PURE__ */ new Map();
    return function schedule(url, operation) {
      const origin = new URL(url).origin;
      const previous = queues.get(origin) ?? Promise.resolve();
      const current = previous.catch(() => {
      }).then(async () => {
        const elapsed = now() - (lastStartedAt.get(origin) ?? -Infinity);
        const remaining = Math.max(0, minIntervalMs - elapsed);
        if (remaining > 0) await wait(remaining);
        lastStartedAt.set(origin, now());
        return operation();
      });
      queues.set(origin, current.catch(() => {
      }));
      return current;
    };
  }
  var scheduleSiteRequest = createOriginRequestScheduler();

  // src/sites/fetch-document.js
  async function fetchDocument(url, { onProgress, siteLabel } = {}) {
    return scheduleSiteRequest(url, async () => {
      onProgress?.(`\uC694\uCCAD: ${url}`);
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(
          `${siteLabel ?? "\uC0AC\uC774\uD2B8"} \uC694\uCCAD \uC2E4\uD328 (${response.status}): ${url}`
        );
      }
      const html = await response.text();
      onProgress?.(
        `\uC644\uB8CC: ${response.status} \xB7 ${html.length.toLocaleString("ko-KR")} bytes`
      );
      return new DOMParser().parseFromString(html, "text/html");
    });
  }

  // src/sites/gamejob.js
  var SITE = "gamejob";
  var RECRUITMENT_PAGE_SIZE = 10;
  function queryValue(url, key) {
    try {
      return new URL(url).searchParams.get(key);
    } catch {
      return null;
    }
  }
  function getPostingId(url) {
    return queryValue(url, "GI_No");
  }
  function getGamejobCompanyId(document2, url) {
    const fromUrl = queryValue(url, "M");
    if (fromUrl) return fromUrl;
    const link = getCompanyLink(document2);
    return link ? queryValue(new URL(link, url), "M") : null;
  }
  function getGamejobPageType(url) {
    if (queryValue(url, "GI_No")) return "posting";
    if (queryValue(url, "M")) return "company";
    return "other";
  }
  function getCompanyLink(document2) {
    return firstAttribute(
      document2,
      [
        '.corp-name a[href*="/Company/Detail?M="]',
        'a.corp-link[href*="/Company/Detail?M="]',
        'a[href*="/Company/Detail"][class*="company"]',
        'a[href*="/Company/Detail"][class*="name"]',
        'a[href*="/Company/Detail"]'
      ],
      "href"
    );
  }
  function getCompanyName(document2) {
    const posting = findJsonLd(document2, "JobPosting");
    const organization = findJsonLd(document2, "Organization");
    return cleanText(posting?.hiringOrganization?.name) || cleanText(organization?.name) || firstText(document2, [
      ".corpHeader .corpName",
      ".company-name",
      ".company-title h1",
      ".company-info .name",
      ".corp-name",
      'a[href*="/Company/Detail"][class*="name"]',
      'a[href*="/Company/Detail"]'
    ]);
  }
  function definitionValue(document2, labels) {
    const wanted = Array.isArray(labels) ? labels : [labels];
    const term = [...document2.querySelectorAll("dt")].find(
      (element) => wanted.includes(cleanText(element.textContent))
    );
    return cleanText(term?.nextElementSibling?.textContent) || null;
  }
  function parseGamejobDateTime(value) {
    const text = cleanText(value);
    const match = text.match(
      /(\d{4})[.-](\d{1,2})[.-](\d{1,2})\s+(\d{1,2}):(\d{2})/
    );
    if (!match) return null;
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T${match[4].padStart(2, "0")}:${match[5]}:00+09:00`;
  }
  function findPostingTimestamp(document2, suffix) {
    const element = [
      ...document2.querySelectorAll(".recruit-data-ddyytt .date")
    ].find((item) => cleanText(item.textContent).endsWith(suffix));
    const text = cleanText(element?.textContent);
    return {
      value: parseGamejobDateTime(text),
      text: text || null
    };
  }
  function parseDeadline(document2) {
    const deadlineText = definitionValue(document2, ["\uB9C8\uAC10\uC77C", "\uB0A8\uC740\uAE30\uAC04"]);
    return {
      deadlineText,
      deadline: /채용시|상시/.test(deadlineText ?? "") ? null : normalizePageDate(deadlineText)
    };
  }
  function parseGamejobCompanyInformation(document2, sourceUrl) {
    const location2 = definitionValue(document2, "\uD68C\uC0AC\uC704\uCE58");
    return {
      sourceUrl,
      name: getCompanyName(document2),
      representative: definitionValue(document2, "\uB300\uD45C\uC790\uBA85"),
      establishedYear: definitionValue(document2, ["\uC124\uB9BD\uC5F0\uB3C4", "\uC124\uB9BD\uB144\uB3C4"]),
      employeeCount: parseNumber(definitionValue(document2, "\uC0AC\uC6D0\uC218")),
      totalPostingCount: parseGamejobCompanyPostingCount(document2),
      address: location2?.replace(/https?:\/\/\S+$/i, "").trim() || null,
      companyType: definitionValue(document2, "\uAE30\uC5C5\uD615\uD0DC"),
      representativeGames: definitionValue(document2, "\uB300\uD45C\uAC8C\uC784"),
      mainBusiness: definitionValue(document2, "\uC8FC\uC694\uC0AC\uC5C5"),
      informationLoaded: true
    };
  }
  function parseGamejobCompanyPostingCount(document2) {
    const candidates = document2.querySelectorAll(
      'a[href*="tabcode=3" i], button, [role="tab"]'
    );
    for (const element of candidates) {
      const text = cleanText(element.textContent);
      if (!text.includes("\uCC44\uC6A9\uC815\uBCF4")) continue;
      const count2 = parseNumber(text.replace("\uCC44\uC6A9\uC815\uBCF4", ""));
      if (Number.isFinite(count2)) return count2;
    }
    return null;
  }
  function parsePosting(document2, company, url) {
    const externalId = getPostingId(url);
    if (!externalId) return null;
    const structured = findJsonLd(document2, "JobPosting");
    const title = cleanText(structured?.title) || firstText(document2, [
      ".corp-title h1",
      ".recruit-title h1",
      ".view-title h1",
      ".job-title",
      "main h1"
    ]);
    if (!title) return null;
    const pageDeadline = parseDeadline(document2);
    const deadlineText = pageDeadline.deadlineText || cleanText(structured?.validThrough);
    const deadline = pageDeadline.deadline ?? (/채용시|상시/.test(deadlineText ?? "") ? null : normalizePageDate(deadlineText));
    const registered = findPostingTimestamp(document2, "\uB4F1\uB85D");
    const modified = findPostingTimestamp(document2, "\uC218\uC815");
    const observedAt = (/* @__PURE__ */ new Date()).toISOString();
    const status = derivePostingStatus({
      documentText: document2.body?.innerText ?? "",
      deadline,
      closedPatterns: [/접수마감/, /마감된 채용/, /채용이 종료/],
      openPatterns: [/지원하기/, /채용시 마감/, /상시채용/]
    });
    return {
      id: `${SITE}:posting:${externalId}`,
      externalId,
      companyId: company?.id ?? null,
      title,
      url: normalizeUrl(url),
      status,
      openedAt: registered.value ?? normalizePageDate(
        structured?.datePosted || labeledText(document2, ["\uC2DC\uC791\uC77C", "\uB4F1\uB85D\uC77C"])
      ),
      registeredAt: registered.value,
      registeredText: registered.text,
      lastModifiedAt: modified.value,
      lastModifiedText: modified.text,
      modifiedDate: seoulDateKey(modified.value) ?? estimateGamejobModifiedDate(modified.text, observedAt),
      observedAt,
      closedAt: status === "closed" ? deadline : null,
      deadline,
      deadlineText,
      applicantCount: parseNumber(
        labeledText(document2, ["\uC9C0\uC6D0\uC790\uC218", "\uC9C0\uC6D0\uD604\uD669", "\uC9C0\uC6D0\uC790"])
      )
    };
  }
  function parseRecruitmentCounts(document2) {
    const counts = { total: null, open: null, closed: null };
    for (const button of document2.querySelectorAll(".countBx button.count")) {
      const text = cleanText(button.textContent);
      const count2 = parseNumber(button.querySelector("em")?.textContent ?? text);
      if (text.startsWith("\uC804\uCCB4")) counts.total = count2;
      else if (text.startsWith("\uC9C4\uD589\uC911")) counts.open = count2;
      else if (text.startsWith("\uB9C8\uAC10")) counts.closed = count2;
    }
    return counts;
  }
  function recruitmentTable(document2) {
    return [...document2.querySelectorAll("table")].find(
      (table) => cleanText(table.querySelector("caption")?.textContent) === "\uCC44\uC6A9\uC815\uBCF4 \uB9AC\uC2A4\uD2B8"
    );
  }
  function parseGamejobRecruitmentList(document2, sourceUrl, page = 1) {
    const counts = parseRecruitmentCounts(document2);
    const observedAt = (/* @__PURE__ */ new Date()).toISOString();
    const rows = recruitmentTable(document2)?.querySelectorAll("tbody tr") ?? [];
    const postings = [...rows].map((row) => {
      const link = row.querySelector('a[href*="/Recruit/GI_Read/View"]');
      const url = normalizeUrl(link?.getAttribute("href"), sourceUrl);
      const externalId = url ? getPostingId(url) : null;
      const deadlineText = cleanText(row.querySelector(".date")?.textContent);
      const lastModifiedText = cleanText(
        row.querySelector(".modifyDate")?.textContent
      );
      const title = cleanText(link?.textContent);
      if (!title || !externalId) return null;
      return {
        id: `${SITE}:posting:${externalId}`,
        externalId,
        title,
        url,
        urlAvailable: true,
        status: /마감/.test(deadlineText ?? "") ? "closed" : "open",
        deadline: /채용시|상시/.test(deadlineText ?? "") ? null : normalizePageDate(deadlineText),
        deadlineText: deadlineText || null,
        lastModifiedAt: null,
        lastModifiedText: lastModifiedText || null,
        modifiedDate: estimateGamejobModifiedDate(lastModifiedText, observedAt),
        observedAt,
        page
      };
    }).filter(Boolean);
    return { counts, postings };
  }
  function emptyRecruitments() {
    return {
      totalCount: null,
      openCount: null,
      closedCount: null,
      pageSize: RECRUITMENT_PAGE_SIZE,
      pageCount: null,
      maxPageCount: 100,
      loadedPages: [],
      loadedPageCount: 0,
      loadedPostingCount: 0,
      postings: [],
      hasMore: true,
      linkCheckedAt: null,
      countsUpdatedAt: null
    };
  }
  function mergeGamejobRecruitmentPage(data, pageResult) {
    const current = data.recruitments ?? emptyRecruitments();
    const postingMap = new Map(
      (current.postings ?? []).map((posting) => [posting.id, posting])
    );
    for (const posting of pageResult.postings ?? []) {
      postingMap.set(posting.id, posting);
    }
    const loadedPages = [
      .../* @__PURE__ */ new Set([...current.loadedPages ?? [], pageResult.page])
    ].sort((left, right) => left - right);
    const totalCount = pageResult.counts?.total ?? current.totalCount;
    const pageCount = Number.isFinite(totalCount) ? Math.max(1, Math.ceil(totalCount / RECRUITMENT_PAGE_SIZE)) : null;
    const lastLoadedPage = loadedPages.at(-1) ?? 0;
    const hasMore = pageCount !== null ? lastLoadedPage < pageCount : (pageResult.postings?.length ?? 0) >= RECRUITMENT_PAGE_SIZE;
    return {
      ...data,
      recruitments: {
        ...current,
        totalCount,
        openCount: pageResult.counts?.open ?? current.openCount,
        closedCount: pageResult.counts?.closed ?? current.closedCount,
        countsUpdatedAt: pageResult.checkedAt ?? current.countsUpdatedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
        pageCount,
        maxPageCount: pageCount ?? current.maxPageCount,
        loadedPages,
        loadedPageCount: loadedPages.length,
        loadedPostingCount: postingMap.size,
        postings: [...postingMap.values()],
        hasMore,
        linkCheckedAt: hasMore ? null : pageResult.checkedAt ?? (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
  function resolveCollectionContext(currentDocument, currentUrl) {
    const companyId = getGamejobCompanyId(currentDocument, currentUrl);
    if (!companyId) {
      throw new Error("\uD604\uC7AC \uD398\uC774\uC9C0\uC5D0\uC11C \uAC8C\uC784\uC7A1 \uAE30\uC5C5 ID\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }
    const origin = new URL(currentUrl).origin;
    return {
      pageType: getGamejobPageType(currentUrl),
      companyId,
      companyUrl: `${origin}/Company/Detail?M=${companyId}`,
      recruitmentsUrl: `${origin}/Company/Detail?tabcode=3&M=${companyId}`
    };
  }
  function createGamejobCollectionData(currentDocument, currentUrl) {
    const context = resolveCollectionContext(currentDocument, currentUrl);
    const companyInformation = parseGamejobCompanyInformation(
      currentDocument,
      context.companyUrl
    );
    const company = {
      id: `${SITE}:${context.companyId}`,
      externalId: context.companyId,
      ...companyInformation,
      companyUrl: context.companyUrl,
      recruitmentsUrl: context.recruitmentsUrl
    };
    let data = {
      site: SITE,
      siteLabel: "\uAC8C\uC784\uC7A1",
      collectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pageType: context.pageType,
      sourceUrl: normalizeUrl(currentUrl),
      company,
      currentPosting: context.pageType === "posting" ? parsePosting(currentDocument, company, currentUrl) : null,
      recruitments: emptyRecruitments(),
      warnings: []
    };
    if (context.pageType === "company" && queryValue(currentUrl, "tabcode") === "3") {
      const page = Math.max(1, Number(queryValue(currentUrl, "page")) || 1);
      data = mergeGamejobRecruitmentPage(data, {
        ...parseGamejobRecruitmentList(currentDocument, currentUrl, page),
        page
      });
    }
    return data;
  }
  async function loadGamejobCompanyInformation(currentDocument, currentUrl, { onProgress } = {}) {
    const context = resolveCollectionContext(currentDocument, currentUrl);
    if (["posting", "company"].includes(context.pageType)) {
      return parseGamejobCompanyInformation(currentDocument, context.companyUrl);
    }
    const companyDocument = await fetchDocument(context.companyUrl, {
      onProgress,
      siteLabel: "\uAC8C\uC784\uC7A1"
    });
    return parseGamejobCompanyInformation(companyDocument, context.companyUrl);
  }
  async function loadGamejobListCompanyInformation(company, currentUrl, { onProgress } = {}) {
    const companyId = cleanText(company?.id);
    if (!companyId) throw new Error("\uAC8C\uC784\uC7A1 \uAE30\uC5C5 ID\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    const sourceUrl = new URL(
      `/Company/Detail?M=${encodeURIComponent(companyId)}`,
      currentUrl
    ).href;
    const companyDocument = await fetchDocument(sourceUrl, {
      onProgress,
      siteLabel: "\uAC8C\uC784\uC7A1"
    });
    return parseGamejobCompanyInformation(companyDocument, sourceUrl);
  }
  async function loadGamejobListCompanyPostingCount(company, currentUrl, { onProgress } = {}) {
    const companyId = cleanText(company?.id);
    if (!companyId) throw new Error("\uAC8C\uC784\uC7A1 \uAE30\uC5C5 ID\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    const sourceUrl = new URL(
      `/Company/Detail?tabcode=3&M=${encodeURIComponent(companyId)}&page=1`,
      currentUrl
    ).href;
    const recruitmentDocument = await fetchDocument(sourceUrl, {
      onProgress,
      siteLabel: "\uAC8C\uC784\uC7A1"
    });
    const counts = parseRecruitmentCounts(recruitmentDocument);
    const derivedTotal = Number.isFinite(counts.total) ? counts.total : Number.isFinite(counts.open) && Number.isFinite(counts.closed) ? counts.open + counts.closed : null;
    return {
      totalPostingCount: derivedTotal,
      openPostingCount: counts.open,
      closedPostingCount: counts.closed,
      recruitmentSourceUrl: sourceUrl
    };
  }
  async function loadGamejobRecruitmentPage(currentDocument, currentUrl, page = 1, { onProgress } = {}) {
    const context = resolveCollectionContext(currentDocument, currentUrl);
    const currentPage = Math.max(1, Number(queryValue(currentUrl, "page")) || 1);
    const sourceUrl = `${context.recruitmentsUrl}&page=${page}`;
    const recruitmentDocument = context.pageType === "company" && queryValue(currentUrl, "tabcode") === "3" && currentPage === page ? currentDocument : await fetchDocument(sourceUrl, {
      onProgress,
      siteLabel: "\uAC8C\uC784\uC7A1"
    });
    return {
      ...parseGamejobRecruitmentList(recruitmentDocument, sourceUrl, page),
      page,
      sourceUrl,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  var gamejob = {
    id: SITE,
    label: "\uAC8C\uC784\uC7A1",
    matches(url) {
      try {
        return /(^|\.)gamejob\.co\.kr$/i.test(new URL(url).hostname);
      } catch {
        return false;
      }
    },
    getPageType: getGamejobPageType,
    getCompany(document2, url = document2.location.href) {
      if (!queryValue(url, "M") && !getPostingId(url)) return null;
      const companyLink = getCompanyLink(document2);
      const companyUrl = normalizeUrl(companyLink, url);
      const externalId = getGamejobCompanyId(document2, url);
      return createCompany({
        site: SITE,
        externalId,
        name: getCompanyName(document2),
        url: externalId ? `${new URL(url).origin}/Company/Detail?M=${externalId}` : companyUrl || normalizeUrl(url)
      });
    },
    getPosting(document2, company, url = document2.location.href) {
      return parsePosting(document2, company, url);
    },
    getEmployeeCount(document2) {
      const organization = findJsonLd(document2, "Organization");
      const structuredCount = parseNumber(
        organization?.numberOfEmployees?.value ?? organization?.numberOfEmployees
      );
      return structuredCount ?? parseNumber(definitionValue(document2, "\uC0AC\uC6D0\uC218")) ?? labeledNumber(document2, ["\uC0AC\uC6D0\uC218", "\uC9C1\uC6D0\uC218", "\uC7AC\uC9C1\uC790\uC218"]);
    },
    async getHistory() {
      return [];
    },
    createCollectionData: createGamejobCollectionData,
    loadCompanyInformation: loadGamejobCompanyInformation,
    loadListCompanyInformation: loadGamejobListCompanyInformation,
    loadListCompanyPostingCount: loadGamejobListCompanyPostingCount,
    loadRecruitmentPage: loadGamejobRecruitmentPage,
    mergeRecruitmentPage: mergeGamejobRecruitmentPage
  };

  // src/sites/jobkorea.js
  var SITE2 = "jobkorea";
  var RECRUITMENT_PAGE_SIZE2 = 30;
  var MAX_RECRUITMENT_PAGES = 4;
  function getCompanyId(url) {
    const pathname = new URL(url).pathname;
    return pathname.match(/\/recruit\/co_read\/(?:recruit\/)?c\/(\d+)/i)?.[1] ?? pathname.match(/\/company\/(\d+)/i)?.[1] ?? null;
  }
  function getPostingId2(url) {
    return new URL(url).pathname.match(/\/recruit\/gi_read\/(\d+)/i)?.[1] ?? null;
  }
  function normalizeCompanyNameKey(value) {
    return cleanText(value).toLocaleLowerCase("ko-KR").replace(/\(주\)|㈜|주식회사/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  }
  function getStructuredCompanyName(document2) {
    const posting = findJsonLd(document2, "JobPosting");
    const organization = findJsonLd(document2, "Organization");
    return cleanText(posting?.hiringOrganization?.name) || cleanText(organization?.name);
  }
  function getCurrentCompanyAnchor(document2) {
    const structuredNameKey = normalizeCompanyNameKey(
      getStructuredCompanyName(document2)
    );
    const candidates = [
      ...document2.querySelectorAll(
        'a[href*="/Recruit/Co_Read/C/"], a[href*="/company/"]'
      )
    ];
    let best = null;
    let bestScore = -1;
    for (const anchor of candidates) {
      const href = cleanText(anchor.getAttribute?.("href"));
      const absoluteHref = normalizeUrl(href, document2.location?.href);
      if (!absoluteHref || !getCompanyId(absoluteHref)) {
        continue;
      }
      const text = cleanText(anchor.textContent);
      const nameKey = normalizeCompanyNameKey(text);
      let score = 0;
      if (structuredNameKey && nameKey === structuredNameKey) score += 100;
      else if (structuredNameKey && nameKey && (nameKey.includes(structuredNameKey) || structuredNameKey.includes(nameKey))) {
        score += 60;
      }
      if (anchor.querySelector?.("h1, h2")) score += 30;
      if (!/[?&](?:Oem_Code|sc)=/i.test(href)) score += 15;
      if (anchor.closest?.("main")) score += 5;
      if (score > bestScore) {
        best = anchor;
        bestScore = score;
      }
    }
    return best;
  }
  function getCompanyLink2(document2) {
    return getCurrentCompanyAnchor(document2)?.getAttribute?.("href") ?? null;
  }
  function getCompanyName2(document2) {
    const structuredName = getStructuredCompanyName(document2);
    const linkedName = cleanText(getCurrentCompanyAnchor(document2)?.textContent);
    return structuredName || firstText(document2, [
      ".company-header-branding-body .name",
      ".company-header-name",
      ".company-header h1",
      ".company-header .name",
      ".company-title h1",
      ".corp-name",
      ".companyName",
      'a[href*="/company/"][class*="name"]'
    ]) || (/기업정보|더보기/.test(linkedName) ? null : linkedName);
  }
  function getTableValue(document2, label) {
    const headers = document2.querySelectorAll(
      ".company-infomation-row table th, .company-infomation-row table [role='rowheader']"
    );
    const header = [...headers].find(
      (element) => cleanText(element.textContent) === label
    );
    return cleanText(header?.nextElementSibling?.textContent) || null;
  }
  function getCompanyAddress(document2) {
    const organization = findJsonLd(document2, "Organization");
    const structuredAddress = organization?.address;
    const structuredValue = typeof structuredAddress === "string" ? cleanText(structuredAddress) : cleanText(structuredAddress?.streetAddress) || cleanText(
      [structuredAddress?.addressRegion, structuredAddress?.addressLocality].filter(Boolean).join(" ")
    );
    return structuredValue || getTableValue(document2, "\uC8FC\uC18C") || getTableValue(document2, "\uAE30\uC5C5\uC8FC\uC18C") || getTableValue(document2, "\uD68C\uC0AC\uC8FC\uC18C") || getTableValue(document2, "\uBCF8\uC0AC\uC8FC\uC18C") || labeledText(document2, ["\uC8FC\uC18C", "\uAE30\uC5C5\uC8FC\uC18C", "\uD68C\uC0AC\uC8FC\uC18C", "\uBCF8\uC0AC\uC8FC\uC18C"]);
  }
  function getJobkoreaPageType(url) {
    const pathname = new URL(url).pathname;
    if (/\/recruit\/gi_read\/\d+/i.test(pathname)) return "posting";
    if (/\/recruit\/co_read\/recruit\/c\/\d+/i.test(pathname)) {
      return "recruitments";
    }
    if (/\/recruit\/co_read\/c\/\d+/i.test(pathname)) return "company";
    return "other";
  }
  function parseApplicantCount(document2) {
    const section = document2.querySelector(
      '[data-sentry-component="ApplicantStatistics"]'
    );
    const text = cleanText(section?.innerText);
    if (/지원자\s*수\s*3\s*명\s*미만/.test(text)) return null;
    const match = text.match(
      /지원자\s*수\s*([\d,]+)\s*명/
    );
    return parseNumber(match?.[1]);
  }
  function parseApplicantCountText(document2) {
    const section = document2.querySelector(
      '[data-sentry-component="ApplicantStatistics"]'
    );
    return /지원자\s*수\s*3\s*명\s*미만/.test(cleanText(section?.innerText)) ? "3\uBA85 \uBBF8\uB9CC" : null;
  }
  function parseRecruitmentDeadline(value, now = /* @__PURE__ */ new Date()) {
    const text = cleanText(value);
    const explicit = text.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
    if (explicit) {
      return `${explicit[1]}-${explicit[2].padStart(2, "0")}-${explicit[3].padStart(2, "0")}`;
    }
    const remaining = text.match(/D-(\d+)/i);
    if (remaining) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + Number(remaining[1])
      );
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-");
    }
    if (/D-DAY/i.test(text)) {
      return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
      ].join("-");
    }
    return null;
  }
  function parseEmploymentHistory(document2) {
    const card = document2.querySelector(
      ".employment-status-card.recruit-history"
    );
    if (!card) return null;
    const totalCount = parseNumber(card.querySelector(".total")?.textContent);
    const regularCount = parseNumber(card.querySelector(".of")?.textContent);
    const rawExperienceCounts = {};
    for (const row of card.querySelectorAll("table.skip tr")) {
      const label = cleanText(row.querySelector("th")?.textContent).replace(
        /\s+/g,
        ""
      );
      const count2 = parseNumber(row.querySelector("td")?.textContent);
      if (label && count2 !== null) rawExperienceCounts[label] = count2;
    }
    return {
      periodYears: 3,
      totalCount,
      employmentType: {
        regularCount,
        nonRegularCount: totalCount !== null && regularCount !== null ? Math.max(0, totalCount - regularCount) : null,
        nonRegularIsDerived: true
      },
      experienceType: {
        entryCount: rawExperienceCounts["\uC2E0\uC785"] ?? 0,
        noExperienceRequiredCount: rawExperienceCounts["\uC2E0\uC785,\uACBD\uB825"] ?? rawExperienceCounts["\uC2E0\uC785\xB7\uACBD\uB825"] ?? 0,
        experiencedCount: rawExperienceCounts["\uACBD\uB825"] ?? 0,
        sourceLabelForNoExperienceRequired: "\uC2E0\uC785,\uACBD\uB825",
        raw: rawExperienceCounts
      }
    };
  }
  function parseCompanyInformation(document2, sourceUrl) {
    return {
      sourceUrl,
      name: getCompanyName2(document2),
      employeeCount: parseNumber(getTableValue(document2, "\uC0AC\uC6D0\uC218")),
      address: getCompanyAddress(document2),
      employmentHistory: parseEmploymentHistory(document2)
    };
  }
  function parseRecruitmentCounts2(document2) {
    const counts = { total: null, open: null, closed: null };
    for (const button of document2.querySelectorAll(".sortList .btnSort")) {
      const text = cleanText(button.textContent);
      const count2 = parseNumber(button.querySelector(".num")?.textContent);
      if (text.startsWith("\uC804\uCCB4")) counts.total = count2;
      else if (text.startsWith("\uC9C4\uD589\uC911")) counts.open = count2;
      else if (text.startsWith("\uB9C8\uAC10")) counts.closed = count2;
    }
    return counts;
  }
  function parseRecruitmentList(document2, sourceUrl, page = 1) {
    const counts = parseRecruitmentCounts2(document2);
    const postings = [...document2.querySelectorAll(".jobInfo .list-item")].map((item, index) => {
      const link = item.querySelector("a.AgiLink, a.devEndRecruit");
      const rawUrl = cleanText(link?.getAttribute("href"));
      const url = rawUrl && rawUrl !== "#" ? normalizeUrl(rawUrl, sourceUrl) : null;
      const externalId = cleanText(item.getAttribute("data-gno")) || (url ? getPostingId2(url) : null);
      const deadlineText = cleanText(item.querySelector(".day")?.textContent);
      const title = cleanText(item.querySelector(".tit")?.textContent);
      if (!title) return null;
      const archivedKey = `${page}:${index + 1}:${title}:${deadlineText}`;
      return {
        id: externalId ? `${SITE2}:posting:${externalId}` : `${SITE2}:posting:archived:${encodeURIComponent(archivedKey)}`,
        externalId: externalId || null,
        title,
        url,
        urlAvailable: Boolean(url),
        status: item.classList.contains("end") ? "closed" : "open",
        deadline: parseRecruitmentDeadline(deadlineText),
        deadlineText: deadlineText || null,
        experience: cleanText(
          item.querySelector(".trm .cell.add")?.textContent
        ),
        page
      };
    }).filter(Boolean);
    return { counts, postings };
  }
  function resolveCollectionContext2(currentDocument, currentUrl) {
    const pageType = getJobkoreaPageType(currentUrl);
    const currentCompanyLink = getCompanyLink2(currentDocument);
    const companyId = getCompanyId(currentUrl) || (currentCompanyLink ? getCompanyId(new URL(currentCompanyLink, currentUrl)) : null);
    if (!companyId) {
      throw new Error("\uD604\uC7AC \uD398\uC774\uC9C0\uC5D0\uC11C \uC7A1\uCF54\uB9AC\uC544 \uAE30\uC5C5 ID\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }
    const baseUrl = new URL(currentUrl).origin;
    const companyUrl = `${baseUrl}/Recruit/Co_Read/C/${companyId}`;
    const recruitmentsUrl = `${baseUrl}/Recruit/Co_Read/Recruit/C/${companyId}?GI_Part_Code=0&Search_Order=2&ChkDispType=0&Part_Btn_Stat=0`;
    return { pageType, companyId, companyUrl, recruitmentsUrl };
  }
  function emptyRecruitments2() {
    return {
      totalCount: null,
      openCount: null,
      closedCount: null,
      pageSize: RECRUITMENT_PAGE_SIZE2,
      pageCount: null,
      maxPageCount: MAX_RECRUITMENT_PAGES,
      loadedPages: [],
      loadedPageCount: 0,
      loadedPostingCount: 0,
      postings: [],
      hasMore: true,
      linkCheckedAt: null
    };
  }
  function mergeRecruitmentPage(data, pageResult) {
    const current = data.recruitments ?? emptyRecruitments2();
    const postingMap = new Map(
      (current.postings ?? []).map((posting) => [posting.id, posting])
    );
    for (const posting of pageResult.postings ?? []) {
      postingMap.set(posting.id, posting);
    }
    const loadedPages = [
      .../* @__PURE__ */ new Set([...current.loadedPages ?? [], pageResult.page])
    ].sort((left, right) => left - right);
    const totalCount = pageResult.counts?.total ?? current.totalCount;
    const pageCount = Number.isFinite(totalCount) ? Math.min(
      MAX_RECRUITMENT_PAGES,
      Math.max(1, Math.ceil(totalCount / RECRUITMENT_PAGE_SIZE2))
    ) : null;
    const lastLoadedPage = loadedPages.at(-1) ?? 0;
    const hasMore = pageCount !== null ? lastLoadedPage < pageCount : lastLoadedPage < MAX_RECRUITMENT_PAGES && (pageResult.postings?.length ?? 0) >= RECRUITMENT_PAGE_SIZE2;
    return {
      ...data,
      recruitments: {
        ...current,
        totalCount,
        openCount: pageResult.counts?.open ?? current.openCount,
        closedCount: pageResult.counts?.closed ?? current.closedCount,
        pageCount,
        loadedPages,
        loadedPageCount: loadedPages.length,
        loadedPostingCount: postingMap.size,
        postings: [...postingMap.values()],
        hasMore,
        linkCheckedAt: hasMore ? null : pageResult.checkedAt ?? (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
  function createJobkoreaCollectionData(currentDocument, currentUrl) {
    const { pageType, companyId, companyUrl, recruitmentsUrl } = resolveCollectionContext2(currentDocument, currentUrl);
    const companyOnPage = pageType === "company" ? parseCompanyInformation(currentDocument, companyUrl) : null;
    const currentPosting = pageType === "posting" ? {
      id: `${SITE2}:posting:${getPostingId2(currentUrl)}`,
      externalId: getPostingId2(currentUrl),
      title: firstText(currentDocument, ["main h1", "h1"]),
      url: normalizeUrl(currentUrl),
      applicantCount: parseApplicantCount(currentDocument),
      applicantCountText: parseApplicantCountText(currentDocument)
    } : null;
    let data = {
      site: SITE2,
      siteLabel: "\uC7A1\uCF54\uB9AC\uC544",
      collectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pageType,
      sourceUrl: normalizeUrl(currentUrl),
      company: {
        id: `${SITE2}:${companyId}`,
        externalId: companyId,
        name: companyOnPage?.name ?? getCompanyName2(currentDocument),
        employeeCount: companyOnPage?.employeeCount ?? null,
        address: companyOnPage?.address ?? null,
        employmentHistory: companyOnPage?.employmentHistory ?? null,
        informationLoaded: Boolean(companyOnPage),
        companyUrl,
        recruitmentsUrl
      },
      currentPosting,
      recruitments: emptyRecruitments2(),
      warnings: []
    };
    if (pageType === "recruitments") {
      const searchOrder = new URL(currentUrl).searchParams.get("Search_Order");
      const page = Math.max(
        1,
        Number(new URL(currentUrl).searchParams.get("page") ?? "1") || 1
      );
      if (searchOrder === "2") {
        data = mergeRecruitmentPage(data, {
          ...parseRecruitmentList(currentDocument, currentUrl, page),
          page
        });
      }
    }
    return data;
  }
  async function loadJobkoreaCompanyInformation(currentDocument, currentUrl, { onProgress } = {}) {
    const context = resolveCollectionContext2(currentDocument, currentUrl);
    const companyDocument = context.pageType === "company" ? currentDocument : await fetchDocument(context.companyUrl, {
      onProgress,
      siteLabel: "\uC7A1\uCF54\uB9AC\uC544"
    });
    return {
      ...parseCompanyInformation(companyDocument, context.companyUrl),
      informationLoaded: true
    };
  }
  async function loadJobkoreaRecruitmentPage(currentDocument, currentUrl, page = 1, { onProgress } = {}) {
    const context = resolveCollectionContext2(currentDocument, currentUrl);
    const currentPage = Number(
      new URL(currentUrl).searchParams.get("page") ?? "1"
    );
    const currentSearchOrder = new URL(currentUrl).searchParams.get(
      "Search_Order"
    );
    const sourceUrl = page === 1 ? context.recruitmentsUrl : `${context.recruitmentsUrl}&page=${page}`;
    const recruitmentDocument = context.pageType === "recruitments" && currentPage === page && currentSearchOrder === "2" ? currentDocument : await fetchDocument(sourceUrl, {
      onProgress,
      siteLabel: "\uC7A1\uCF54\uB9AC\uC544"
    });
    return {
      ...parseRecruitmentList(recruitmentDocument, sourceUrl, page),
      page,
      sourceUrl,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  var jobkorea = {
    id: SITE2,
    label: "\uC7A1\uCF54\uB9AC\uC544",
    matches(url) {
      try {
        return /(^|\.)jobkorea\.co\.kr$/i.test(new URL(url).hostname);
      } catch {
        return false;
      }
    },
    getPageType: getJobkoreaPageType,
    getCompany(document2, url = document2.location.href) {
      if (!getCompanyId(url) && !getPostingId2(url)) return null;
      const companyLink = getCompanyLink2(document2);
      const companyUrl = normalizeUrl(companyLink, url);
      const externalId = getCompanyId(url) || (companyUrl ? getCompanyId(companyUrl) : null);
      return createCompany({
        site: SITE2,
        externalId,
        name: getCompanyName2(document2),
        url: externalId ? `https://www.jobkorea.co.kr/Recruit/Co_Read/C/${externalId}` : companyUrl
      });
    },
    getPosting(document2, company, url = document2.location.href) {
      const externalId = getPostingId2(url);
      if (!externalId) return null;
      const structured = findJsonLd(document2, "JobPosting");
      const title = cleanText(structured?.title) || firstText(document2, [
        ".recruit-header h1",
        ".recruitment-title",
        ".tit-area h1",
        "main h1",
        "h1"
      ]);
      if (!title) return null;
      const deadline = normalizePageDate(
        structured?.validThrough || labeledText(document2, ["\uB9C8\uAC10\uC77C", "\uC811\uC218\uAE30\uAC04", "\uC9C0\uC6D0\uAE30\uAC04"])
      );
      const pageText = document2.body?.innerText ?? "";
      const status = derivePostingStatus({
        documentText: pageText,
        deadline,
        closedPatterns: [/마감된 채용공고/, /접수마감/, /채용이 마감/],
        openPatterns: [/입사지원/, /홈페이지 지원/, /지원하기/]
      });
      const applicantCountText = parseApplicantCountText(document2);
      return {
        id: `${SITE2}:posting:${externalId}`,
        externalId,
        companyId: company?.id ?? null,
        title,
        url: normalizeUrl(url),
        status,
        openedAt: normalizePageDate(
          structured?.datePosted || labeledText(document2, ["\uB4F1\uB85D\uC77C", "\uACF5\uACE0\uB4F1\uB85D\uC77C"])
        ),
        closedAt: status === "closed" ? deadline : null,
        deadline,
        applicantCount: applicantCountText ? null : parseNumber(
          parseApplicantCount(document2) ?? labeledText(document2, ["\uC9C0\uC6D0\uC790", "\uC9C0\uC6D0\uC790\uC218", "\uC9C0\uC6D0\uD604\uD669"])
        ),
        applicantCountText
      };
    },
    getEmployeeCount(document2) {
      const organization = findJsonLd(document2, "Organization");
      const structuredCount = parseNumber(
        organization?.numberOfEmployees?.value ?? organization?.numberOfEmployees
      );
      return structuredCount ?? parseNumber(getTableValue(document2, "\uC0AC\uC6D0\uC218")) ?? labeledNumber(document2, ["\uC0AC\uC6D0\uC218", "\uC9C1\uC6D0\uC218", "\uC7AC\uC9C1\uC790\uC218"]);
    },
    async getHistory() {
      return [];
    },
    createCollectionData: createJobkoreaCollectionData,
    loadCompanyInformation: loadJobkoreaCompanyInformation,
    loadRecruitmentPage: loadJobkoreaRecruitmentPage,
    mergeRecruitmentPage
  };

  // src/sites/index.js
  var sites = [jobkorea, gamejob];
  function getSite(url) {
    return sites.find((site) => site.matches(url)) ?? null;
  }

  // src/page-visibility.js
  function isHayoungPanelPage(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    if (host === "gamejob.co.kr" || host.endsWith(".gamejob.co.kr")) {
      return [
        /\/recruit\/joblist(?:\/|$)/i,
        /\/recruit\/gi_read\/view(?:\/|$)/i,
        /\/company\/detail(?:\/|$)/i
      ].some((pattern) => pattern.test(path));
    }
    if (host === "jobkorea.co.kr" || host.endsWith(".jobkorea.co.kr")) {
      return [
        /\/recruit\/gi_read\/\d+/i,
        /\/recruit\/co_read\/(?:recruit\/)?c\/\d+/i,
        /\/company\/\d+/i,
        /\/recruit\/(?:joblist|gi_list)(?:\/|$)/i,
        /\/search(?:\/|$)/i
      ].some((pattern) => pattern.test(path));
    }
    return false;
  }

  // src/csv.js
  function decodeCsvBytes(bytes) {
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(source);
    } catch {
      return new TextDecoder("euc-kr").decode(source);
    }
  }
  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = String(text ?? "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1];
      if (character === '"' && quoted && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        row.push(field);
        if (row.some((value) => cleanText(value))) rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }
    row.push(field);
    if (row.some((value) => cleanText(value))) rows.push(row);
    return rows;
  }
  function normalizeCsvColumnName(value) {
    return cleanText(value).normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
  }
  function resolveCsvColumnIndexes(headerRow, aliases) {
    const headers = headerRow.map(normalizeCsvColumnName);
    return Object.fromEntries(
      Object.entries(aliases).map(([key, names]) => [
        key,
        names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1
      ])
    );
  }

  // src/workforce.js
  var COMPANY_MARKERS = [
    /\(주\)/gi,
    /㈜/g,
    /주식회사/g,
    /유한회사/g,
    /유한책임회사/g,
    /재단법인/g,
    /사단법인/g,
    /\b(co\.?|company|corp\.?|corporation|inc\.?|ltd\.?)\b/gi
  ];
  var COLUMN_ALIASES = {
    code: [
      "code",
      "companycode",
      "\uC0AC\uC5C5\uC7A5\uAD00\uB9AC\uBC88\uD638",
      "\uC0AC\uC5C5\uC7A5\uAE30\uD638",
      "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638"
    ],
    name: ["name", "company", "companyname", "\uC0AC\uC5C5\uC7A5\uBA85", "\uC0AC\uC5C5\uCCB4\uBA85", "\uD68C\uC0AC\uBA85"],
    address: [
      "address",
      "\uC0AC\uC5C5\uC7A5\uB3C4\uB85C\uBA85\uC0C1\uC138\uC8FC\uC18C",
      "\uC0AC\uC5C5\uC7A5\uB3C4\uB85C\uBA85\uC8FC\uC18C",
      "\uC0AC\uC5C5\uC7A5\uC9C0\uBC88\uC0C1\uC138\uC8FC\uC18C",
      "\uB3C4\uB85C\uBA85\uC8FC\uC18C",
      "\uC8FC\uC18C"
    ],
    date: ["date", "month", "\uAE30\uC900\uB144\uC6D4", "\uC790\uB8CC\uB144\uC6D4", "\uAC00\uC785\uB144\uC6D4"],
    employeeCount: [
      "employeecount",
      "employees",
      "\uAC00\uC785\uC790\uC218",
      "\uC0AC\uC5C5\uC7A5\uAC00\uC785\uC790\uC218",
      "\uC778\uC6D0"
    ],
    joinedCount: [
      "joinedcount",
      "joined",
      "\uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218",
      "\uCDE8\uB4DD\uC790\uC218",
      "\uC785\uC0AC\uC790\uC218"
    ],
    leftCount: ["leftcount", "left", "\uC0C1\uC2E4\uAC00\uC785\uC790\uC218", "\uC0C1\uC2E4\uC790\uC218", "\uD1F4\uC0AC\uC790\uC218"]
  };
  function normalizeCompanyName(value) {
    let normalized = cleanText(value).normalize("NFKC").toLowerCase();
    for (const marker of COMPANY_MARKERS)
      normalized = normalized.replace(marker, " ");
    return normalized.replace(/[^0-9a-z가-힣]+/g, "").trim();
  }
  function bigrams(value) {
    if (value.length < 2) return value ? [value] : [];
    return Array.from(
      { length: value.length - 1 },
      (_, index) => value.slice(index, index + 2)
    );
  }
  function calculateNameSimilarity(left, right) {
    const a = normalizeCompanyName(left);
    const b = normalizeCompanyName(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const leftPairs = bigrams(a);
    const rightPairs = bigrams(b);
    const remaining = /* @__PURE__ */ new Map();
    for (const pair of rightPairs)
      remaining.set(pair, (remaining.get(pair) ?? 0) + 1);
    let intersection = 0;
    for (const pair of leftPairs) {
      const count2 = remaining.get(pair) ?? 0;
      if (count2 > 0) {
        intersection += 1;
        remaining.set(pair, count2 - 1);
      }
    }
    return 2 * intersection / (leftPairs.length + rightPairs.length);
  }
  function normalizeAddress(value) {
    return cleanText(value).normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]+/g, "");
  }
  function calculateAddressSimilarity(left, right) {
    const a = normalizeAddress(left);
    const b = normalizeAddress(right);
    if (!a || !b) return null;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    return calculateNameSimilarity(a, b);
  }
  function calculateEmployeeSimilarity(left, right) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    if (left === right) return 1;
    const larger = Math.max(left, right);
    if (larger === 0) return 1;
    return Math.max(0, 1 - Math.abs(left - right) / larger);
  }
  function calculateCompanyMatchScore(target, candidate) {
    if (!target || !candidate) return 0;
    const targetCode = cleanText(target.workforceCode ?? target.code);
    const candidateCode = cleanText(candidate.code);
    if (targetCode && candidateCode && targetCode === candidateCode) return 100;
    const targetName = normalizeCompanyName(target.name ?? target);
    const candidateName = normalizeCompanyName(candidate.name);
    if (!targetName || !candidateName) return 0;
    const nameScore = targetName === candidateName ? 0.96 : Math.min(
      0.95,
      calculateNameSimilarity(targetName, candidateName) * 0.88 + (targetName.includes(candidateName) || candidateName.includes(targetName) ? 0.07 : 0)
    );
    const addressScore = calculateAddressSimilarity(
      target.address,
      candidate.address
    );
    const employeeScore = calculateEmployeeSimilarity(
      target.employeeCount,
      candidate.employeeCount
    );
    let weighted = nameScore * 65;
    let weight = 65;
    if (addressScore !== null) {
      weighted += addressScore * 25;
      weight += 25;
    }
    if (employeeScore !== null) {
      weighted += employeeScore * 10;
      weight += 10;
    }
    return Math.round(weighted / weight * 100);
  }
  function normalizeWorkforceDate(value) {
    const text = cleanText(value);
    const separated = text.match(/(\d{4})\D+(\d{1,2})/);
    if (separated) return `${separated[1]}-${separated[2].padStart(2, "0")}`;
    const digits = text.replace(/\D/g, "");
    return digits.length >= 6 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}` : null;
  }
  function normalizeWorkforceRecord(value, index = 0) {
    const name = cleanText(value?.name ?? value?.companyName ?? value?.company);
    if (!name) return null;
    const code = cleanText(value?.code ?? value?.companyCode) || null;
    const date = normalizeWorkforceDate(value?.date ?? value?.month) ?? "unknown";
    const employeeCount = parseNumber(value?.employeeCount ?? value?.employees);
    if (employeeCount === null) return null;
    return {
      id: cleanText(value?.id) || `${code || normalizeCompanyName(name)}:${date}:${index}`,
      code,
      name,
      address: cleanText(value?.address) || null,
      date,
      employeeCount,
      joinedCount: parseNumber(value?.joinedCount ?? value?.joined),
      leftCount: parseNumber(value?.leftCount ?? value?.left)
    };
  }
  function calculateWorkforceChange(previous, current) {
    if (!previous || !current) return null;
    const employeeChange = current.employeeCount - previous.employeeCount;
    return {
      previousDate: previous.date,
      currentDate: current.date,
      previousCount: previous.employeeCount,
      currentCount: current.employeeCount,
      employeeChange,
      percentChange: previous.employeeCount === 0 ? null : employeeChange / previous.employeeCount * 100,
      joinedCount: current.joinedCount,
      leftCount: current.leftCount
    };
  }
  function findCompanyCandidates(target, records, limit = 5) {
    const groups = /* @__PURE__ */ new Map();
    for (const record of records) {
      const normalized = normalizeWorkforceRecord(record);
      if (!normalized) continue;
      const key = normalized.code || normalizeCompanyName(normalized.name);
      const group = groups.get(key) ?? [];
      group.push(normalized);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, history]) => {
      history.sort((a, b) => a.date.localeCompare(b.date));
      const latest = history.at(-1);
      return {
        id: key,
        code: latest.code,
        name: latest.name,
        score: calculateCompanyMatchScore(target, latest),
        latest,
        history,
        change: calculateWorkforceChange(history.at(-2), latest)
      };
    }).filter((candidate) => candidate.score > 0).sort(
      (a, b) => b.score - a.score || b.latest.date.localeCompare(a.latest.date)
    ).slice(0, limit);
  }
  function parseCsv(text) {
    const [headerRow, ...dataRows] = parseCsvRows(text);
    if (!headerRow) return [];
    const indexes = resolveCsvColumnIndexes(headerRow, COLUMN_ALIASES);
    return dataRows.map(
      (row, index) => normalizeWorkforceRecord(
        Object.fromEntries(
          Object.entries(indexes).map(([key, column]) => [
            key,
            column >= 0 ? row[column] : null
          ])
        ),
        index
      )
    );
  }
  function parseWorkforceData(text, filename = "") {
    const isJson = filename.toLowerCase().endsWith(".json") || /^[\s\uFEFF]*[\[{]/.test(text);
    let records;
    if (isJson) {
      const parsed = safeJsonParse(text.replace(/^\uFEFF/, ""));
      records = Array.isArray(parsed) ? parsed : parsed?.workforceRecords ?? parsed?.records;
      if (!Array.isArray(records))
        throw new Error(
          "JSON \uD30C\uC77C\uC5D0\uC11C workforce \uB808\uCF54\uB4DC \uBC30\uC5F4\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
        );
    } else {
      records = parseCsv(text);
    }
    const normalized = records.map(normalizeWorkforceRecord).filter(Boolean);
    const unique = uniqueBy(
      normalized,
      (record) => `${record.code || normalizeCompanyName(record.name)}:${record.date}`
    );
    if (unique.length === 0) throw new Error("\uC720\uD6A8\uD55C \uC778\uB825 \uB808\uCF54\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return unique;
  }
  function calculatePostingRatio(employeeCount, openPostingCount) {
    if (!Number.isFinite(employeeCount) || employeeCount <= 0 || !Number.isFinite(openPostingCount))
      return null;
    return openPostingCount / employeeCount * 100;
  }

  // src/gamejob-list-blocker.js
  var GAMEJOB_HOST = /(^|\.)gamejob\.co\.kr$/i;
  var GAMEJOB_LIST_PATH = /^\/recruit\/(?:joblist|_gi_job_list)/i;
  var POSTING_LINK_SELECTOR = 'a[href*="/Recruit/GI_Read/View?GI_No="], a[href*="/recruit/gi_read/view?GI_No="]';
  var COMPANY_LINK_SELECTOR = 'a[href*="/Company/Detail"], a[href*="/company/detail"]';
  var HIDDEN_ROW_CLASS = "hy-gamejob-hidden-row";
  var CONTROLS_CLASS = "hy-gamejob-hide-controls";
  var COMPANY_INFORMATION_CLASS = "hy-gamejob-company-information";
  var SAVE_BUTTON_CLASS = "hy-gamejob-save-button";
  var SAVE_CONTROL_CLASS = "hy-gamejob-save-control";
  function isGamejobJobListPage(url) {
    try {
      const parsed = new URL(url);
      return GAMEJOB_HOST.test(parsed.hostname) && GAMEJOB_LIST_PATH.test(parsed.pathname);
    } catch {
      return false;
    }
  }
  function getGamejobListPostingId(url, baseUrl) {
    const direct = cleanText(url);
    if (/^\d+$/.test(direct)) return direct;
    try {
      const params = new URL(url, baseUrl).searchParams;
      return params.get("GI_No") ?? [...params].find(([key]) => key.toLowerCase() === "gi_no")?.[1] ?? null;
    } catch {
      return direct.match(/[?&]GI_No=(\d+)/i)?.[1] ?? null;
    }
  }
  function getGamejobCompanyId2(url, baseUrl) {
    try {
      const params = new URL(url, baseUrl).searchParams;
      return params.get("M") ?? [...params].find(([key]) => key.toLowerCase() === "m")?.[1] ?? null;
    } catch {
      return cleanText(url).match(/[?&]M=(\d+)/i)?.[1] ?? null;
    }
  }
  function getGamejobCompanyBlockKey(company) {
    const id = cleanText(company?.id);
    if (id) return "id:" + id;
    const name = normalizeCompanyName(company?.name);
    return name ? "name:" + name : null;
  }
  function normalizeGamejobCompanyBlock(value) {
    if (value && typeof value === "object") {
      const id2 = cleanText(value.id);
      const name = cleanText(value.name);
      return id2 || name ? { id: id2 || null, name: name || null } : null;
    }
    const text = cleanText(value);
    if (!text) return null;
    const id = /^\d+$/.test(text) ? text : text.match(/[?&]M=(\d+)/i)?.[1] ?? null;
    return id ? { id, name: null } : { id: null, name: text };
  }
  function normalizeGamejobSearchPhrase(value) {
    const phrase = value && typeof value === "object" ? value.value ?? value.phrase ?? value.text : value;
    return cleanText(phrase).normalize("NFKC").toLocaleLowerCase("ko-KR");
  }
  function normalizeGamejobPhraseRule(value) {
    const phrase = value && typeof value === "object" ? value.value ?? value.phrase ?? value.text : value;
    const normalized = normalizeGamejobSearchPhrase(phrase);
    if (!normalized) return null;
    return {
      value: cleanText(phrase),
      enabled: value && typeof value === "object" ? value.enabled !== false : true
    };
  }
  function normalizeGamejobPostingBlock(value) {
    if (value && typeof value === "object") {
      const id2 = cleanText(value.id);
      if (!id2) return null;
      return {
        id: id2,
        title: cleanText(value.title) || null,
        blockedAt: cleanText(value.blockedAt) || null
      };
    }
    const id = getGamejobListPostingId(value);
    return id ? { id, title: null, blockedAt: null } : null;
  }
  function createGamejobPostingBlock(value, blockedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    const posting = normalizeGamejobPostingBlock(value);
    return posting ? { ...posting, blockedAt } : null;
  }
  function companyIsHidden(company, hiddenCompanies) {
    const companyId = cleanText(company?.id);
    const companyName = normalizeCompanyName(company?.name);
    return hiddenCompanies.some((hidden) => {
      const hiddenId = cleanText(hidden?.id);
      const hiddenName = normalizeCompanyName(hidden?.name);
      return hiddenId && hiddenId === companyId || hiddenName && hiddenName === companyName;
    });
  }
  function normalizePhraseList(values) {
    return (Array.isArray(values) ? values : []).map(normalizeGamejobPhraseRule).filter((rule) => rule?.enabled).map((rule) => normalizeGamejobSearchPhrase(rule.value)).filter(Boolean);
  }
  function normalizePostingId(value) {
    return cleanText(value).replace(/^gamejob:(?:posting:)?/i, "");
  }
  function evaluateGamejobListPosting({ postingId, title, company }, {
    postings,
    savedPostings,
    companies,
    hidePhrases,
    hideExceptions,
    focusMode = false,
    focusKeywords,
    focusIgnoreHiddenCompanies = false
  } = {}) {
    const hiddenPostingIds = new Set(
      (Array.isArray(postings) ? postings : []).map(normalizeGamejobPostingBlock).filter(Boolean).map((posting) => normalizePostingId(posting.id))
    );
    const savedPostingIds = new Set(
      (Array.isArray(savedPostings) ? savedPostings : []).map(normalizePostingId)
    );
    const hiddenCompanies = (Array.isArray(companies) ? companies : []).map(normalizeGamejobCompanyBlock).filter(Boolean);
    const normalizedTitle = normalizeGamejobSearchPhrase(title);
    const postingHidden = hiddenPostingIds.has(normalizePostingId(postingId));
    const companyHidden = companyIsHidden(company, hiddenCompanies);
    const directHidden = postingHidden || companyHidden && !(focusMode && focusIgnoreHiddenCompanies);
    const saved = savedPostingIds.has(normalizePostingId(postingId));
    const normalizedFocusKeywords = normalizePhraseList(focusKeywords);
    const focusMatch = normalizedFocusKeywords.some(
      (keyword) => normalizedTitle.includes(keyword)
    );
    if (focusMode) {
      const hiddenByFocus = normalizedFocusKeywords.length > 0 && !focusMatch;
      return {
        hidden: directHidden || hiddenByFocus,
        saved,
        focusMatch,
        reason: directHidden ? "direct" : hiddenByFocus ? "focus" : null
      };
    }
    const phraseMatch = normalizePhraseList(hidePhrases).some(
      (phrase) => normalizedTitle.includes(phrase)
    );
    const exceptionMatch = normalizePhraseList(hideExceptions).some(
      (phrase) => normalizedTitle.includes(phrase)
    );
    const hiddenByPhrase = phraseMatch && !exceptionMatch;
    return {
      hidden: directHidden || hiddenByPhrase,
      saved,
      focusMatch: false,
      reason: directHidden ? "direct" : hiddenByPhrase ? "phrase" : null
    };
  }
  var GamejobListBlocker = class {
    constructor(document2, actions2 = {}) {
      this.document = document2;
      this.actions = typeof actions2 === "function" ? { onHidePosting: actions2 } : actions2;
      this.rules = {
        postings: [],
        savedPostings: [],
        companies: [],
        hidePhrases: [],
        hideExceptions: [],
        focusMode: false,
        focusKeywords: [],
        focusPriority: false,
        focusIgnoreHiddenCompanies: false,
        companyInformation: /* @__PURE__ */ new Map(),
        loadingCompanyKeys: /* @__PURE__ */ new Set()
      };
      this.originalOrders = /* @__PURE__ */ new Map();
      this.hiddenCount = 0;
      this.observer = null;
      this.scanQueued = false;
      this.active = false;
    }
    setRules(rules = {}) {
      this.rules = {
        postings: (Array.isArray(rules.postings) ? rules.postings : []).map(normalizeGamejobPostingBlock).filter(Boolean),
        savedPostings: (Array.isArray(rules.savedPostings) ? rules.savedPostings : []).map(normalizePostingId),
        companies: (Array.isArray(rules.companies) ? rules.companies : []).map(normalizeGamejobCompanyBlock).filter(Boolean),
        hidePhrases: normalizePhraseList(rules.hidePhrases),
        hideExceptions: normalizePhraseList(rules.hideExceptions),
        focusMode: Boolean(rules.focusMode),
        focusKeywords: normalizePhraseList(rules.focusKeywords),
        focusPriority: Boolean(rules.focusPriority),
        focusIgnoreHiddenCompanies: Boolean(
          rules.focusIgnoreHiddenCompanies
        ),
        companyInformation: rules.companyInformation instanceof Map ? new Map(rules.companyInformation) : /* @__PURE__ */ new Map(),
        loadingCompanyKeys: rules.loadingCompanyKeys instanceof Set ? new Set(rules.loadingCompanyKeys) : /* @__PURE__ */ new Set()
      };
      this.queueScan();
    }
    start() {
      if (this.observer || !this.document.body) return;
      this.active = true;
      this.scan();
      this.observer = new MutationObserver(() => this.queueScan());
      this.observer.observe(this.document.body, {
        childList: true,
        subtree: true
      });
    }
    stop() {
      this.active = false;
      this.observer?.disconnect();
      this.observer = null;
      this.restoreOriginalOrder();
      for (const controls of this.document.querySelectorAll?.(
        `.${CONTROLS_CLASS}`
      ) ?? []) {
        controls.remove();
      }
      for (const controls of this.document.querySelectorAll?.(
        `.${SAVE_CONTROL_CLASS}`
      ) ?? []) {
        controls.remove();
      }
      for (const information of this.document.querySelectorAll?.(
        `.${COMPANY_INFORMATION_CLASS}`
      ) ?? []) {
        information.remove();
      }
      for (const row of this.document.querySelectorAll?.(
        `.${HIDDEN_ROW_CLASS}`
      ) ?? []) {
        row.classList.remove(HIDDEN_ROW_CLASS);
      }
      this.reportHiddenCount(0);
    }
    queueScan() {
      if (this.scanQueued) return;
      this.scanQueued = true;
      queueMicrotask(() => {
        this.scanQueued = false;
        if (this.active) this.scan();
      });
    }
    scan() {
      const records = [];
      const visitedRows = /* @__PURE__ */ new Set();
      for (const link of this.document.querySelectorAll(POSTING_LINK_SELECTOR)) {
        const postingId = getGamejobListPostingId(
          link.getAttribute("href"),
          this.document.location?.href
        );
        const row = link.closest("tr");
        if (!postingId || !row || visitedRows.has(row)) continue;
        visitedRows.add(row);
        const companyLink = row.querySelector(COMPANY_LINK_SELECTOR);
        const company = {
          id: companyLink ? getGamejobCompanyId2(
            companyLink.getAttribute("href"),
            this.document.location?.href
          ) : null,
          name: cleanText(companyLink?.textContent),
          url: companyLink ? this.normalizeUrl(companyLink.getAttribute("href")) : null
        };
        const posting = {
          postingId,
          id: `gamejob:posting:${postingId}`,
          title: cleanText(link.textContent),
          url: this.normalizeUrl(link.getAttribute("href")),
          company
        };
        const observedAt = (/* @__PURE__ */ new Date()).toISOString();
        const deadlineText = cleanText(row.querySelector(".date")?.textContent);
        const lastModifiedText = cleanText(
          row.querySelector(".modifyDate")?.textContent
        );
        posting.deadlineText = deadlineText || null;
        posting.deadline = /채용시|상시/.test(deadlineText ?? "") ? null : normalizePageDate(deadlineText);
        posting.status = /마감/.test(deadlineText ?? "") ? "closed" : "open";
        posting.lastModifiedText = lastModifiedText || null;
        posting.modifiedDate = estimateGamejobModifiedDate(
          lastModifiedText,
          observedAt
        );
        posting.observedAt = observedAt;
        const decision = evaluateGamejobListPosting(posting, this.rules);
        row.dataset.hyGamejobPostingId = postingId;
        row.classList.toggle(HIDDEN_ROW_CLASS, decision.hidden);
        records.push({ row, link, posting, decision });
        this.renderCompanyInformation(row, companyLink, company);
        this.renderSaveControl(row, link, posting, decision.saved);
        this.syncHideControls(row, link, posting, decision);
      }
      const priorityEnabled = this.rules.focusMode && this.rules.focusPriority && this.rules.focusKeywords.length > 0;
      this.applyStablePriority(records, priorityEnabled);
      this.reportHiddenCount(
        records.reduce(
          (count2, record) => count2 + Number(record.decision.hidden),
          0
        )
      );
    }
    appendHideControls(row, link, posting) {
      const controls = this.document.createElement("span");
      controls.className = CONTROLS_CLASS;
      controls.append(
        this.createHideButton("\uACF5\uACE0 \uC228\uAE30\uAE30", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const hiddenPosting = {
            id: posting.postingId,
            title: posting.title,
            blockedAt: null
          };
          this.rules.postings.push(hiddenPosting);
          row.classList.add(HIDDEN_ROW_CLASS);
          this.actions.onHidePosting?.(hiddenPosting);
          this.queueScan();
        })
      );
      if (posting.company.id || posting.company.name) {
        controls.append(
          this.createHideButton("\uD68C\uC0AC \uC228\uAE30\uAE30", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const hiddenCompany = normalizeGamejobCompanyBlock(posting.company);
            this.rules.companies.push(hiddenCompany);
            row.classList.add(HIDDEN_ROW_CLASS);
            this.actions.onHideCompany?.(hiddenCompany);
            this.queueScan();
          })
        );
      }
      (link.closest("td") ?? row.lastElementChild ?? row).append(controls);
    }
    syncHideControls(row, link, posting, decision) {
      const controls = row.querySelector(`.${CONTROLS_CLASS}`);
      if (decision.hidden) {
        controls?.remove();
        return;
      }
      if (!controls) this.appendHideControls(row, link, posting);
    }
    renderSaveControl(row, link, posting, saved) {
      const target = link.closest("td") ?? row.lastElementChild ?? row;
      let control = row.querySelector?.(`.${SAVE_CONTROL_CLASS}`);
      if (!control) {
        control = this.document.createElement("span");
        control.className = SAVE_CONTROL_CLASS;
        target.append(control);
      }
      if (!control.dataset) control.dataset = {};
      const signature = `${posting.id}:${saved}`;
      if (control.dataset.hySignature === signature) return;
      control.dataset.hySignature = signature;
      control.replaceChildren?.();
      if (!control.replaceChildren) control.textContent = "";
      const button = this.createSavePostingButton(posting);
      button.textContent = saved ? "\uACF5\uACE0 \uC5C5\uB370\uC774\uD2B8" : "\uACF5\uACE0 \uC800\uC7A5\uD558\uAE30";
      control.append(button);
    }
    normalizeUrl(url) {
      try {
        return new URL(url, this.document.location?.href).href;
      } catch {
        return cleanText(url) || null;
      }
    }
    renderCompanyInformation(row, companyLink, company) {
      const companyKey = getGamejobCompanyBlockKey(company);
      const target = companyLink?.closest?.("td") ?? companyLink?.parentElement;
      if (!companyKey || !target?.append) return;
      const information = this.rules.companyInformation.get(companyKey) ?? null;
      const loading = this.rules.loadingCompanyKeys.has(companyKey);
      const signature = JSON.stringify([
        information?.employeeCount ?? null,
        information?.totalPostingCount ?? null,
        information?.openPostingCount ?? null,
        information?.closedPostingCount ?? null,
        information?.updatedAt ?? null,
        loading
      ]);
      let container = row.querySelector?.(`.${COMPANY_INFORMATION_CLASS}`);
      if (!container) {
        container = this.document.createElement("div");
        container.className = COMPANY_INFORMATION_CLASS;
        target.append(container);
      }
      if (container.dataset.hySignature === signature) return;
      container.dataset.hySignature = signature;
      container.replaceChildren?.();
      if (!container.replaceChildren) container.textContent = "";
      if (information) {
        const facts = this.document.createElement("span");
        facts.className = "hy-gamejob-company-facts";
        const updatedAtClass = this.isOlderThanOneDay(information.updatedAt) ? "hy-gamejob-company-updated-at hy-stale" : "hy-gamejob-company-updated-at";
        facts.append(
          this.createCompanyInformationLine(
            `\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218: ${this.formatCompanyCount(information.employeeCount, "\uBA85")}`
          ),
          this.createCompanyInformationLine(
            `\uAC8C\uC784\uC7A1 \uAE30\uC900 \uC804\uCCB4 \uACF5\uACE0 \uC218: ${this.formatCompanyCount(information.totalPostingCount, "\uAC74")}`
          ),
          ...Number.isFinite(information.openPostingCount) || Number.isFinite(information.closedPostingCount) ? [
            this.createCompanyInformationLine(
              `\uD65C\uC131 ${this.formatCompanyCount(information.openPostingCount, "\uAC74")} \xB7 \uB9C8\uAC10 ${this.formatCompanyCount(information.closedPostingCount, "\uAC74")}`
            )
          ] : [],
          this.createCompanyInformationLine(
            `\uC5C5\uB370\uC774\uD2B8: ${this.formatUpdatedAt(information.updatedAt)}`,
            updatedAtClass
          )
        );
        container.append(
          facts,
          this.createCompanyInformationButton(
            loading ? "\uAC31\uC2E0 \uC911\u2026" : "\uC815\uBCF4 \uAC31\uC2E0",
            company,
            loading
          )
        );
        if (!Number.isFinite(information.totalPostingCount)) {
          container.append(
            this.createCompanyPostingCountButton(company, loading)
          );
        }
        return;
      }
      container.append(
        this.createCompanyInformationButton(
          loading ? "\uD68C\uC0AC \uC815\uBCF4 \uBD88\uB7EC\uC624\uB294 \uC911\u2026" : "\uD68C\uC0AC \uC815\uBCF4\uBCF4\uAE30",
          company,
          loading
        )
      );
    }
    createCompanyInformationLine(text, className = "") {
      const line = this.document.createElement("span");
      line.className = className;
      line.textContent = text;
      return line;
    }
    createCompanyInformationButton(label, company, disabled) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "hy-gamejob-company-information-button";
      button.textContent = label;
      button.disabled = disabled;
      button.title = disabled ? "\uAC8C\uC784\uC7A1 \uD68C\uC0AC\uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4." : "\uAC8C\uC784\uC7A1 \uD68C\uC0AC \uD398\uC774\uC9C0\uB97C \uD55C \uBC88 \uC694\uCCAD\uD574 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218\uC640 \uC804\uCCB4 \uACF5\uACE0 \uC218\uB97C \uC800\uC7A5\uD569\uB2C8\uB2E4.";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!button.disabled) this.actions.onLoadCompanyInformation?.(company);
      });
      return button;
    }
    createCompanyPostingCountButton(company, disabled) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "hy-gamejob-company-information-button";
      button.textContent = disabled ? "\uACF5\uACE0\uC218 \uD655\uC778 \uC911\u2026" : "\uC804\uCCB4 \uACF5\uACE0\uC218 \uD655\uC778";
      button.disabled = disabled;
      button.title = "\uAC8C\uC784\uC7A1 \uAE30\uC5C5 \uC0C1\uC138\uC758 \uCC44\uC6A9\uC815\uBCF4 \uD0ED\uC744 \uD55C \uBC88 \uC694\uCCAD\uD574 \uD65C\uC131\xB7\uB9C8\uAC10 \uACF5\uACE0 \uC218\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!button.disabled) {
          this.actions.onLoadCompanyPostingCount?.(company);
        }
      });
      return button;
    }
    formatCompanyCount(value, suffix) {
      return Number.isFinite(value) ? `${value.toLocaleString("ko-KR")}${suffix}` : "\uD655\uC778 \uBD88\uAC00";
    }
    formatUpdatedAt(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "\uD655\uC778 \uBD88\uAC00";
      return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    }
    isOlderThanOneDay(value) {
      const timestamp = new Date(value).getTime();
      return Number.isFinite(timestamp) && Date.now() - timestamp >= 864e5;
    }
    createHideButton(label, onClick) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "hy-gamejob-hide-button";
      button.textContent = label;
      button.title = `${label} \xB7 \uD604\uC7AC \uBAA9\uB85D\uC5D0\uC11C \uBCF4\uC774\uC9C0 \uC54A\uAC8C \uD569\uB2C8\uB2E4.`;
      button.addEventListener("click", onClick);
      return button;
    }
    createSavePostingButton(posting) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = SAVE_BUTTON_CLASS;
      button.textContent = "\uACF5\uACE0 \uC800\uC7A5\uD558\uAE30";
      button.title = "\uCD94\uAC00 \uD398\uC774\uC9C0\uB97C \uC694\uCCAD\uD558\uC9C0 \uC54A\uACE0 \uD604\uC7AC \uBAA9\uB85D HTML\uC5D0 \uD45C\uC2DC\uB41C \uACF5\uACE0\uC640 \uD68C\uC0AC\uB97C \uC800\uC7A5\uD569\uB2C8\uB2E4.";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.actions.onSavePosting?.(posting);
      });
      return button;
    }
    applyStablePriority(records, enabled) {
      if (!enabled) {
        this.restoreOriginalOrder();
        return;
      }
      const recordsByParent = /* @__PURE__ */ new Map();
      for (const record of records) {
        const parent = record.row.parentElement;
        if (!parent?.children) continue;
        if (!recordsByParent.has(parent)) recordsByParent.set(parent, []);
        recordsByParent.get(parent).push(record);
      }
      for (const [parent, parentRecords] of recordsByParent) {
        const currentChildren = [...parent.children];
        const previousOriginal = this.originalOrders.get(parent) ?? [];
        const original = [
          ...previousOriginal.filter((child) => child.parentElement === parent),
          ...currentChildren.filter((child) => !previousOriginal.includes(child))
        ];
        this.originalOrders.set(parent, original);
        const recordByRow = new Map(
          parentRecords.map((record) => [record.row, record])
        );
        const sortedPostingRows = original.filter((child) => recordByRow.has(child)).sort(
          (left, right) => Number(recordByRow.get(right).decision.focusMatch) - Number(recordByRow.get(left).decision.focusMatch)
        );
        let postingIndex = 0;
        const desired = original.map(
          (child) => recordByRow.has(child) ? sortedPostingRows[postingIndex++] : child
        );
        this.reorderChildren(parent, desired);
      }
    }
    restoreOriginalOrder() {
      for (const [parent, children] of this.originalOrders) {
        if (!parent?.isConnected && parent?.isConnected !== void 0) continue;
        this.reorderChildren(
          parent,
          children.filter((child) => child.parentElement === parent)
        );
      }
      this.originalOrders.clear();
    }
    reorderChildren(parent, desired) {
      const current = [...parent.children];
      if (current.length === desired.length && current.every((child, index) => child === desired[index])) {
        return;
      }
      parent.append(...desired);
    }
    reportHiddenCount(count2) {
      if (count2 === this.hiddenCount) return;
      this.hiddenCount = count2;
      this.actions.onHiddenCountChange?.(count2);
    }
  };

  // src/gamejob-embed.js
  var GAMEJOB_HOST2 = /(^|\.)gamejob\.co\.kr$/i;
  function pageKind(url) {
    try {
      const parsed = new URL(url);
      if (!GAMEJOB_HOST2.test(parsed.hostname)) return null;
      if (isGamejobJobListPage(url)) return "list";
      if (/^\/recruit\/gi_read\/view/i.test(parsed.pathname)) return "posting";
      if (/^\/company\/detail/i.test(parsed.pathname)) return "company";
    } catch {
      return null;
    }
    return null;
  }
  function getGamejobEmbedContext(currentDocument, url) {
    const kind = pageKind(url);
    const selector = {
      list: "#aside",
      posting: ".content-right",
      company: ".aside-wrap"
    }[kind];
    const target = selector ? currentDocument.querySelector(selector) : null;
    return target ? { kind, target } : null;
  }

  // src/section-order.js
  var DEFAULT_SECTION_ORDER = Object.freeze([
    "companyInfo",
    "postingDetails",
    "pastPostings",
    "workforce",
    "pensionData",
    "enhancedSearch"
  ]);
  var PRIMARY_SECTION_ORDER = Object.freeze([
    "postingDetails",
    "pastPostings",
    "workforce",
    "pensionData"
  ]);
  function prioritizePrimarySections(value) {
    const saved = uniqueKnownKeys(value, DEFAULT_SECTION_ORDER);
    const order = [
      ...saved,
      ...DEFAULT_SECTION_ORDER.filter((key) => !saved.includes(key))
    ];
    const primary = new Set(PRIMARY_SECTION_ORDER);
    const companyInfo = order.includes("companyInfo") ? ["companyInfo"] : [];
    const remainder = order.filter(
      (key) => key !== "companyInfo" && !primary.has(key)
    );
    return [
      ...companyInfo,
      ...PRIMARY_SECTION_ORDER,
      ...remainder
    ].filter((key, index, values) => values.indexOf(key) === index);
  }
  function uniqueKnownKeys(keys, knownKeys) {
    const known = new Set(knownKeys);
    return [...new Set((keys ?? []).filter((key) => known.has(key)))];
  }
  function resolveVisibleSectionOrder(availableKeys, savedOrder) {
    const available = [...availableKeys];
    const saved = uniqueKnownKeys(savedOrder, available);
    const leadingSections = ["companyInfo", "postingDetails"].filter(
      (key) => available.includes(key) && !saved.includes(key)
    );
    return [.../* @__PURE__ */ new Set([...leadingSections, ...saved, ...available])];
  }
  function mergeVisibleSectionOrder(previousOrder, visibleOrder, knownOrder = DEFAULT_SECTION_ORDER) {
    const previous = uniqueKnownKeys(previousOrder, knownOrder);
    const visibleKeys = uniqueKnownKeys(visibleOrder, knownOrder);
    const visible = new Set(visibleKeys);
    const merged = [];
    let insertedVisible = false;
    for (const key of previous) {
      if (visible.has(key)) {
        if (!insertedVisible) merged.push(...visibleKeys);
        insertedVisible = true;
      } else {
        merged.push(key);
      }
    }
    if (!insertedVisible) merged.push(...visibleKeys);
    for (const key of knownOrder) {
      if (!merged.includes(key)) merged.push(key);
    }
    return merged;
  }

  // src/gamejob-search-settings.js
  var SETTING_BY_KIND = Object.freeze({
    companies: "gamejobHiddenCompanies",
    hidePhrases: "gamejobHidePhrases",
    hideExceptions: "gamejobHideExceptions",
    focusKeywords: "gamejobFocusKeywords",
    postings: "gamejobHiddenPostings"
  });
  function addUnique(values, item, keyOf) {
    const targetKey = keyOf(item);
    return values.some((value) => keyOf(value) === targetKey) ? values : [...values, item];
  }
  function addHiddenGamejobPosting(settings, posting) {
    const value = createGamejobPostingBlock(posting);
    if (!value) return null;
    const record = { ...value, title: value.title || "\uC81C\uBAA9 \uBBF8\uAE30\uB85D \uACF5\uACE0" };
    return {
      gamejobHiddenPostings: addUnique(
        settings.gamejobHiddenPostings ?? [],
        record,
        (item) => String(normalizeGamejobPostingBlock(item)?.id ?? "")
      )
    };
  }
  function removeHiddenGamejobPosting(settings, postingId) {
    const targetId = String(postingId ?? "");
    return {
      gamejobHiddenPostings: (settings.gamejobHiddenPostings ?? []).filter(
        (item) => normalizeGamejobPostingBlock(item)?.id !== targetId
      )
    };
  }
  function addHiddenGamejobCompany(settings, company) {
    const value = normalizeGamejobCompanyBlock(company);
    const key = getGamejobCompanyBlockKey(value);
    if (!value || !key) return null;
    return {
      gamejobHiddenCompanies: addUnique(
        settings.gamejobHiddenCompanies ?? [],
        value,
        getGamejobCompanyBlockKey
      )
    };
  }
  function removeHiddenGamejobCompany(settings, companyKey) {
    return {
      gamejobHiddenCompanies: (settings.gamejobHiddenCompanies ?? []).filter(
        (company) => getGamejobCompanyBlockKey(company) !== companyKey
      )
    };
  }
  function addGamejobPhrase(settings, settingKey, phrase) {
    const value = normalizeGamejobPhraseRule(phrase);
    if (!value) return null;
    const current = (settings[settingKey] ?? []).map(normalizeGamejobPhraseRule).filter(Boolean);
    return {
      [settingKey]: addUnique(
        current,
        value,
        normalizeGamejobSearchPhrase
      )
    };
  }
  function removeGamejobPhrase(settings, settingKey, phrase) {
    const normalized = normalizeGamejobSearchPhrase(phrase);
    return {
      [settingKey]: (settings[settingKey] ?? []).filter(
        (item) => normalizeGamejobSearchPhrase(item) !== normalized
      )
    };
  }
  function setGamejobPhraseEnabled(settings, settingKey, phrase, enabled) {
    const target = normalizeGamejobSearchPhrase(phrase);
    if (!target) return null;
    return {
      [settingKey]: (settings[settingKey] ?? []).map(normalizeGamejobPhraseRule).filter(Boolean).map(
        (rule) => normalizeGamejobSearchPhrase(rule.value) === target ? { ...rule, enabled: Boolean(enabled) } : rule
      )
    };
  }
  function reorderGamejobSearchItems(settings, kind, orderedKeys) {
    const settingKey = SETTING_BY_KIND[kind];
    if (!settingKey) return null;
    const values = settings[settingKey] ?? [];
    const keyOf = kind === "companies" ? getGamejobCompanyBlockKey : kind === "postings" ? (item) => String(normalizeGamejobPostingBlock(item)?.id ?? "") : normalizeGamejobSearchPhrase;
    const byKey = new Map(values.map((item) => [keyOf(item), item]));
    const reordered = orderedKeys.map((key) => byKey.get(key)).filter(Boolean);
    const selected = new Set(orderedKeys);
    reordered.push(...values.filter((item) => !selected.has(keyOf(item))));
    return { [settingKey]: reordered };
  }

  // src/saved-records.js
  var POSTING_FIELDS = Object.freeze([
    "id",
    "externalId",
    "companyId",
    "title",
    "url",
    "status",
    "deadline",
    "deadlineText",
    "openedAt",
    "registeredAt",
    "registeredText",
    "lastModifiedAt",
    "lastModifiedText"
  ]);
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function recordId(prefix, savedAt, suffix = "") {
    return `${prefix}:${savedAt}${suffix ? `:${suffix}` : ""}`;
  }
  function normalizeAlertColor(value) {
    const color = String(value ?? "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#fff0d8";
  }
  function createCompanyAlert(text, color = "#fff0d8", updatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    const normalizedText = String(text ?? "").trim();
    if (!normalizedText) return null;
    return {
      id: "manual",
      type: "manual",
      text: normalizedText.slice(0, 240),
      color: normalizeAlertColor(color),
      updatedAt
    };
  }
  function normalizeCompanyAlerts(value) {
    return (Array.isArray(value) ? value : []).map((alert) => {
      const normalized = createCompanyAlert(
        alert?.text,
        alert?.color,
        alert?.updatedAt
      );
      return normalized ? {
        ...normalized,
        id: String(alert?.id ?? normalized.id),
        type: String(alert?.type ?? normalized.type),
        priority: Number.isFinite(Number(alert?.priority)) ? Number(alert.priority) : 0
      } : null;
    }).filter(Boolean);
  }
  function pickPostingFields(posting) {
    return Object.fromEntries(
      POSTING_FIELDS.filter((key) => posting[key] !== void 0).map((key) => [
        key,
        posting[key]
      ])
    );
  }
  function createCompanyRecord(company = {}) {
    return {
      profile: { ...company },
      companyAlerts: [],
      postings: {},
      gamejobOfficialWorkforce: null,
      gamejobOfficialWorkforceHistory: [],
      gamejobPostingDetails: {},
      workforceCode: null,
      gamejobListInformation: null
    };
  }
  function normalizeCompanyRecord(value, fallbackProfile = {}) {
    const record = isObject(value) ? value : {};
    const profile = isObject(record.profile) ? record.profile : {};
    const postings = isObject(record.postings) ? Object.fromEntries(
      Object.entries(record.postings).map(([key, posting]) => {
        const normalized = normalizeSavedPosting(posting);
        return normalized ? [normalized.id ?? key, normalized] : null;
      }).filter(Boolean)
    ) : {};
    const workforceHistory = normalizeGamejobOfficialWorkforceHistory([
      ...Array.isArray(record.gamejobOfficialWorkforceHistory) ? record.gamejobOfficialWorkforceHistory : [],
      ...record.gamejobOfficialWorkforce ? [record.gamejobOfficialWorkforce] : []
    ]);
    const workforce = workforceHistory[0] ?? null;
    return {
      profile: { ...fallbackProfile, ...profile },
      companyAlerts: normalizeCompanyAlerts(record.companyAlerts),
      postings,
      gamejobOfficialWorkforce: workforce,
      gamejobOfficialWorkforceHistory: workforceHistory,
      gamejobPostingDetails: normalizeGamejobPostingDetails(
        record.gamejobPostingDetails
      ),
      workforceCode: record.workforceCode ?? null,
      gamejobListInformation: isObject(record.gamejobListInformation) ? { ...record.gamejobListInformation } : null
    };
  }
  function resetLegacyCompanySaves(value) {
    const record = isObject(value) ? value : {};
    return {
      profile: isObject(record.profile) ? { ...record.profile } : {},
      companyAlerts: [],
      postings: {},
      gamejobOfficialWorkforce: null,
      gamejobOfficialWorkforceHistory: [],
      gamejobPostingDetails: {},
      workforceCode: record.workforceCode ?? null,
      gamejobListInformation: isObject(record.gamejobListInformation) ? { ...record.gamejobListInformation } : null
    };
  }
  function createSavedPosting(posting, existing = null, savedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    if (!posting?.id || !posting?.title || !posting?.url) return null;
    const modifiedDate = getPostingModifiedDate(posting);
    return {
      ...pickPostingFields(posting),
      ...modifiedDate ? { modifiedDate } : {},
      savedAt: existing?.savedAt ?? savedAt
    };
  }
  function normalizeSavedPosting(posting) {
    if (!isObject(posting)) return null;
    return createSavedPosting(posting, posting, posting.savedAt);
  }
  function createGamejobOfficialWorkforce(employeeCount, savedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    if (!Number.isFinite(employeeCount)) return null;
    return {
      id: recordId("workforce", savedAt, employeeCount),
      employeeCount,
      savedAt,
      source: "gamejob:official"
    };
  }
  function normalizeGamejobOfficialWorkforce(value) {
    if (!isObject(value) || !Number.isFinite(value.employeeCount)) return null;
    const record = createGamejobOfficialWorkforce(
      value.employeeCount,
      value.savedAt
    );
    return record ? { ...record, id: String(value.id ?? record.id) } : null;
  }
  function normalizeGamejobOfficialWorkforceHistory(value) {
    const byId = /* @__PURE__ */ new Map();
    for (const item of Array.isArray(value) ? value : []) {
      const record = normalizeGamejobOfficialWorkforce(item);
      if (record) byId.set(record.id, record);
    }
    return [...byId.values()].sort(
      (left, right) => String(right.savedAt).localeCompare(String(left.savedAt))
    );
  }
  function createGamejobPostingDetailRecord(posting, savedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    if (!posting?.id || !posting?.title || !posting?.url) return null;
    return {
      id: recordId("posting-detail", savedAt),
      title: posting.title,
      url: posting.url,
      registeredAt: posting.registeredAt ?? posting.openedAt ?? null,
      registeredText: posting.registeredText ?? null,
      lastModifiedAt: posting.lastModifiedAt ?? null,
      lastModifiedText: posting.lastModifiedText ?? null,
      savedAt
    };
  }
  function normalizeGamejobPostingDetails(value) {
    if (!isObject(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([postingId, detail]) => {
        const normalizedRecords = (Array.isArray(detail?.records) ? detail.records : []).map((record) => {
          const normalized = createGamejobPostingDetailRecord(
            { ...record, id: postingId },
            record?.savedAt
          );
          return normalized ? { ...normalized, id: String(record.id ?? normalized.id) } : null;
        }).filter(Boolean).sort(
          (left, right) => String(right.savedAt).localeCompare(String(left.savedAt))
        );
        const recordsBySnapshot = /* @__PURE__ */ new Map();
        for (const record of normalizedRecords) {
          const signature = [
            record.title,
            record.registeredAt,
            record.registeredText,
            record.lastModifiedAt,
            record.lastModifiedText
          ].join("\0");
          if (!recordsBySnapshot.has(signature)) {
            recordsBySnapshot.set(signature, record);
          }
        }
        const records = [...recordsBySnapshot.values()];
        if (records.length === 0) return null;
        const latest = records[0];
        return [
          postingId,
          {
            id: postingId,
            title: String(detail?.title ?? latest.title),
            url: String(detail?.url ?? latest.url),
            records
          }
        ];
      }).filter(Boolean)
    );
  }

  // src/pension-matches.js
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function getPensionSourceKey(value) {
    return normalizeCompanyName(value);
  }
  function normalizePensionMatchTarget(value) {
    const name = cleanText(value?.name);
    if (!name) return null;
    return {
      name,
      address: cleanText(value?.address) || null
    };
  }
  function normalizeMatchRecord(value, sourceName, timestampKey) {
    const target = normalizePensionMatchTarget(value);
    if (!target) return null;
    const record = {
      sourceName: cleanText(value?.sourceName) || cleanText(sourceName),
      ...target,
      [timestampKey]: cleanText(value?.[timestampKey]) || null
    };
    if (timestampKey === "boundAt") {
      record.addressScore = Number.isFinite(value?.addressScore) ? Math.max(0, Math.min(100, Math.round(value.addressScore))) : null;
      record.addressWarning = value?.addressWarning === true;
    }
    return record;
  }
  function normalizeRecordMap(value, timestampKey) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const records = {};
    for (const [sourceName, recordValue] of Object.entries(value)) {
      const key = getPensionSourceKey(sourceName);
      const record = normalizeMatchRecord(recordValue, sourceName, timestampKey);
      if (key && record) records[key] = record;
    }
    return records;
  }
  function normalizeDirectoryOptOuts(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const records = {};
    for (const [sourceName, recordValue] of Object.entries(value)) {
      const key = getPensionSourceKey(sourceName);
      if (!key) continue;
      records[key] = {
        sourceName: cleanText(recordValue?.sourceName) || cleanText(sourceName) || key,
        disabledAt: cleanText(recordValue?.disabledAt) || null
      };
    }
    return records;
  }
  function normalizePensionMatches(value) {
    return {
      cache: normalizeRecordMap(value?.cache, "cachedAt"),
      binds: normalizeRecordMap(value?.binds, "boundAt"),
      directoryOptOuts: normalizeDirectoryOptOuts(value?.directoryOptOuts)
    };
  }
  function isPensionDirectoryBindingDisabled(value, sourceName) {
    const key = getPensionSourceKey(sourceName);
    if (!key) return false;
    const matches = normalizePensionMatches(value?.pensionMatches ?? value);
    return Boolean(matches.directoryOptOuts[key]);
  }
  function getCachedPensionCompanyMatch(value, sourceName) {
    const key = getPensionSourceKey(sourceName);
    if (!key) return null;
    const matches = normalizePensionMatches(value?.pensionMatches ?? value);
    const record = matches.cache[key];
    return record ? { ...record, mode: "cache" } : null;
  }
  function getBoundPensionCompanyMatch(value, sourceName) {
    const key = getPensionSourceKey(sourceName);
    if (!key) return null;
    const matches = normalizePensionMatches(value?.pensionMatches ?? value);
    const record = matches.binds[key];
    return record ? { ...record, mode: "manual" } : null;
  }
  function createPensionMatchRecord(sourceName, target, mode) {
    const normalizedTarget = normalizePensionMatchTarget(target);
    const normalizedSourceName = cleanText(sourceName);
    if (!normalizedSourceName || !normalizedTarget) return null;
    const timestampKey = mode === "manual" ? "boundAt" : "cachedAt";
    const record = {
      sourceName: normalizedSourceName,
      ...normalizedTarget,
      [timestampKey]: nowIso()
    };
    if (mode === "manual") {
      record.addressScore = Number.isFinite(target?.addressScore) ? Math.max(0, Math.min(100, Math.round(target.addressScore))) : null;
      record.addressWarning = target?.addressWarning === true;
    }
    return record;
  }
  function createPensionDirectoryOptOutRecord(sourceName) {
    const normalizedSourceName = cleanText(sourceName);
    if (!normalizedSourceName) return null;
    return {
      sourceName: normalizedSourceName,
      disabledAt: nowIso()
    };
  }
  function isSamePensionMatch(left, right) {
    const leftTarget = normalizePensionMatchTarget(left);
    const rightTarget = normalizePensionMatchTarget(right);
    return Boolean(
      leftTarget && rightTarget && leftTarget.name === rightTarget.name && leftTarget.address === rightTarget.address
    );
  }

  // src/pension-policy.js
  var PENSION_LATEST_CHECK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1e3;
  var BUNDLED_PENSION_SEED_VERSION = "2026-08-game-directory-v4";
  function normalizePensionMonth(value) {
    const match = cleanText(value).match(/^(20\d{2})\D?(0?[1-9]|1[0-2])$/);
    return match ? `${match[1]}-${match[2].padStart(2, "0")}` : null;
  }
  function getPensionSourceMonth(source) {
    const explicit = normalizePensionMonth(source?.portalMonth);
    if (explicit) return explicit;
    const name = cleanText(source?.name ?? source);
    const compact = name.match(/(20\d{2})(0[1-9]|1[0-2])(?:[0-3]\d)?/);
    if (compact) return `${compact[1]}-${compact[2]}`;
    const korean = name.match(/(20\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월/);
    return korean ? `${korean[1]}-${korean[2].padStart(2, "0")}` : null;
  }
  function getLatestPensionMonth(values) {
    return (values ?? []).map((value) => normalizePensionMonth(value)).filter(Boolean).sort().at(-1) ?? null;
  }
  function getLatestPortalFileMonth(files) {
    return getLatestPensionMonth(
      (files ?? []).map((file) => file?.month ?? getPensionSourceMonth(file))
    );
  }
  function normalizePensionPolicy(value) {
    const checkedAt = cleanText(value?.checkedAt) || null;
    return {
      requiredLatestMonth: normalizePensionMonth(value?.requiredLatestMonth),
      checkedAt: checkedAt && Number.isFinite(new Date(checkedAt).getTime()) ? checkedAt : null,
      bundledSeedApplied: value?.bundledSeedApplied === true,
      bundledSeedVersion: cleanText(value?.bundledSeedVersion) || null
    };
  }
  function isPensionPolicyCheckDue(value, nowValue = Date.now()) {
    const policy = normalizePensionPolicy(value);
    if (!policy.checkedAt || !policy.requiredLatestMonth) return true;
    const checkedAt = new Date(policy.checkedAt).getTime();
    const now = new Date(nowValue).getTime();
    return !Number.isFinite(now) || now - checkedAt >= PENSION_LATEST_CHECK_INTERVAL_MS || now < checkedAt;
  }
  function isRequiredPensionMonthInstalled(summary, policyValue) {
    const required = normalizePensionPolicy(policyValue).requiredLatestMonth;
    if (!required) return false;
    const installedLatest = getLatestPensionMonth(summary?.installedSourceMonths);
    return Boolean(installedLatest && installedLatest >= required);
  }
  function assertRequiredPensionMonth(currentSummary, incomingSourceMonths, requiredMonthValue) {
    const required = normalizePensionMonth(requiredMonthValue);
    if (!required) return;
    const latest = getLatestPensionMonth([
      ...currentSummary?.installedSourceMonths ?? [],
      ...incomingSourceMonths ?? []
    ]);
    if (!latest || latest < required) {
      throw new Error(
        `\uCD5C\uC2E0 ${required} \uC5F0\uAE08 \uD30C\uC77C\uC744 \uBA3C\uC800 \uCD94\uAC00\uD574\uC57C \uD569\uB2C8\uB2E4. \uC774\uC804 \uC6D4\uC774\uB098 JSON\uB9CC \uB2E8\uB3C5\uC73C\uB85C \uC124\uCE58\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`
      );
    }
  }

  // src/ui-preferences.js
  var PANEL_THEMES = Object.freeze([
    Object.freeze({
      value: "white",
      label: "\uD654\uC774\uD2B8",
      description: "\uBC1D\uACE0 \uC911\uB9BD\uC801\uC778 \uAE30\uBCF8 \uD14C\uB9C8\uC785\uB2C8\uB2E4."
    }),
    Object.freeze({
      value: "blue",
      label: "\uBE14\uB8E8",
      description: "\uD30C\uB780\uC0C9 \uACC4\uC5F4\uB85C \uD328\uB110\uACFC \uAD6C\uD68D\uC744 \uAD6C\uBD84\uD569\uB2C8\uB2E4."
    })
  ]);
  var PANEL_TONES = Object.freeze([
    Object.freeze({
      value: "none",
      label: "\uC5C6\uC74C",
      description: "\uD14C\uB9C8 \uBCF8\uB798 \uC0C9\uC0C1\uC744 \uADF8\uB300\uB85C \uC0AC\uC6A9\uD569\uB2C8\uB2E4."
    }),
    Object.freeze({
      value: "red",
      label: "\uBD89\uAC8C",
      description: "\uD50C\uB85C\uD305 \uCC3D \uC804\uCCB4\uC5D0 \uC605\uC740 \uBD89\uC740 \uC0C9\uC870\uB97C \uC785\uD799\uB2C8\uB2E4."
    }),
    Object.freeze({
      value: "blue",
      label: "\uD478\uB974\uAC8C",
      description: "\uD50C\uB85C\uD305 \uCC3D \uC804\uCCB4\uC5D0 \uC605\uC740 \uD478\uB978 \uC0C9\uC870\uB97C \uC785\uD799\uB2C8\uB2E4."
    })
  ]);
  var DEFAULT_PANEL_TONE_INTENSITY = 10;
  var MAX_PANEL_TONE_INTENSITY = 30;
  var DEFAULT_PANEL_SIZE = Object.freeze({ width: 390, height: 720 });
  var MIN_PANEL_SIZE = Object.freeze({ width: 320, height: 250 });
  var THEME_VALUES = new Set(PANEL_THEMES.map(({ value }) => value));
  var TONE_VALUES = new Set(PANEL_TONES.map(({ value }) => value));
  function normalizePanelTheme(value) {
    return THEME_VALUES.has(value) ? value : "white";
  }
  function normalizePanelTone(value) {
    return TONE_VALUES.has(value) ? value : "none";
  }
  function normalizePanelToneIntensity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_PANEL_TONE_INTENSITY;
    return Math.min(MAX_PANEL_TONE_INTENSITY, Math.max(0, Math.round(number)));
  }
  function normalizePanelSize(value) {
    const width = Number(value?.width);
    const height = Number(value?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
      width: Math.min(4096, Math.max(MIN_PANEL_SIZE.width, Math.round(width))),
      height: Math.min(4096, Math.max(MIN_PANEL_SIZE.height, Math.round(height)))
    };
  }

  // src/storage-schema.js
  var SCHEMA_VERSION = 19;
  var V3_SECTION_ORDER = Object.freeze([
    "companyInfo",
    "workforce",
    "postings",
    "officialWorkforce",
    "options"
  ]);
  var V4_SECTION_ORDER = Object.freeze([
    "companyInfo",
    "postingDetails",
    "workforce",
    "postings",
    "officialWorkforce",
    "options"
  ]);
  var V8_SECTION_ORDER = Object.freeze([
    "companyInfo",
    "postingDetails",
    "pastPostings",
    "workforce",
    "postings",
    "officialWorkforce",
    "blocking",
    "options"
  ]);
  var DEFAULT_SETTINGS = Object.freeze({
    embedded: false,
    collapsed: false,
    simpleMode: true,
    fontScale: 1,
    theme: "white",
    panelTone: "none",
    panelToneIntensity: DEFAULT_PANEL_TONE_INTENSITY,
    size: null,
    position: null,
    positionLocked: false,
    autoCompanyInfo: false,
    autoPastPostings: false,
    scrollLoadPostings: false,
    favoritePostingSearches: [],
    gamejobHiddenPostings: [],
    gamejobHiddenCompanies: [],
    gamejobHidePhrases: [],
    gamejobHideExceptions: [],
    gamejobFocusMode: false,
    gamejobFocusKeywords: [],
    gamejobFocusPriority: false,
    gamejobFocusIgnoreHiddenCompanies: false,
    enhancedSearchGroups: {
      companies: true,
      hidePhrases: true,
      hideExceptions: true,
      focusKeywords: true,
      postings: true
    },
    enhancedSearchOrder: [
      "companies",
      "hidePhrases",
      "hideExceptions",
      "focusKeywords",
      "postings"
    ],
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    sectionVisibility: {
      companyInfo: true,
      postingDetails: true,
      pastPostings: true,
      workforce: true,
      pensionData: true,
      enhancedSearch: true
    },
    sections: {
      companyInfo: true,
      postingDetails: true,
      pastPostings: true,
      workforce: true,
      pensionData: true,
      enhancedSearch: true
    }
  });
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function createEmptyData() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      settings: clone(DEFAULT_SETTINGS),
      companies: {},
      workforceRecords: [],
      pensionMatches: { cache: {}, binds: {}, directoryOptOuts: {} },
      pensionPolicy: {
        requiredLatestMonth: null,
        checkedAt: null,
        bundledSeedApplied: false,
        bundledSeedVersion: null
      }
    };
  }
  function migrateV0ToV1(value) {
    const empty = createEmptyData();
    return {
      ...empty,
      settings: { ...empty.settings, ...value.settings ?? {} },
      companies: value.companies ?? {},
      workforceRecords: value.workforceRecords ?? [],
      schemaVersion: 1
    };
  }
  function migrateV1ToV2(value) {
    const defaults = clone(DEFAULT_SETTINGS);
    return {
      ...value,
      settings: {
        ...defaults,
        ...value.settings ?? {},
        sections: {
          ...defaults.sections,
          ...value.settings?.sections ?? {}
        },
        sectionOrder: Array.isArray(value.settings?.sectionOrder) ? value.settings.sectionOrder : defaults.sectionOrder
      },
      schemaVersion: 2
    };
  }
  function migrateV2ToV3(value) {
    const settings = value.settings ?? {};
    const previousOrder = Array.isArray(settings.sectionOrder) ? settings.sectionOrder : [];
    const nextOrder = [];
    for (const key of previousOrder) {
      if (key === "history") {
        nextOrder.push("postings", "officialWorkforce");
      } else if (key !== "data" && V3_SECTION_ORDER.includes(key)) {
        nextOrder.push(key);
      }
    }
    if (!nextOrder.includes("companyInfo")) nextOrder.unshift("companyInfo");
    for (const key of V3_SECTION_ORDER) {
      if (!nextOrder.includes(key)) nextOrder.push(key);
    }
    return {
      ...value,
      settings: {
        ...settings,
        sectionOrder: [...new Set(nextOrder)],
        sections: {
          companyInfo: settings.sections?.companyInfo ?? true,
          workforce: settings.sections?.workforce ?? true,
          postings: settings.sections?.postings ?? settings.sections?.history ?? true,
          officialWorkforce: settings.sections?.officialWorkforce ?? settings.sections?.history ?? true,
          options: settings.sections?.options ?? true
        }
      },
      schemaVersion: 3
    };
  }
  function migrateV3ToV4(value) {
    const settings = value.settings ?? {};
    const sectionOrder = Array.isArray(settings.sectionOrder) ? settings.sectionOrder.filter((key) => V4_SECTION_ORDER.includes(key)) : [...V3_SECTION_ORDER];
    if (!sectionOrder.includes("companyInfo"))
      sectionOrder.unshift("companyInfo");
    if (!sectionOrder.includes("postingDetails")) {
      sectionOrder.splice(
        sectionOrder.indexOf("companyInfo") + 1,
        0,
        "postingDetails"
      );
    }
    return {
      ...value,
      settings: {
        ...settings,
        sectionOrder,
        sections: {
          ...settings.sections ?? {},
          postingDetails: true
        }
      },
      schemaVersion: 4
    };
  }
  function migrateV4ToV5(value) {
    const settings = value.settings ?? {};
    const sectionOrder = Array.isArray(settings.sectionOrder) ? settings.sectionOrder.filter((key) => V4_SECTION_ORDER.includes(key)) : [...V4_SECTION_ORDER];
    if (!sectionOrder.includes("pastPostings")) {
      const anchor = sectionOrder.indexOf("postingDetails");
      sectionOrder.splice(anchor >= 0 ? anchor + 1 : 0, 0, "pastPostings");
    }
    return {
      ...value,
      settings: {
        ...settings,
        manualGamejobPostingSave: settings.manualGamejobPostingSave ?? false,
        favoritePostingSearches: Array.isArray(settings.favoritePostingSearches) ? settings.favoritePostingSearches : [],
        sectionOrder,
        sections: {
          ...settings.sections ?? {},
          pastPostings: true
        }
      },
      schemaVersion: 5
    };
  }
  function migrateV5ToV6(value) {
    const settings = value.settings ?? {};
    return {
      ...value,
      settings: {
        ...settings,
        blockedGamejobPostingIds: Array.isArray(settings.blockedGamejobPostingIds) ? settings.blockedGamejobPostingIds : []
      },
      schemaVersion: 6
    };
  }
  function migrateV6ToV7(value) {
    const settings = value.settings ?? {};
    const sectionOrder = Array.isArray(settings.sectionOrder) ? settings.sectionOrder.filter((key) => V8_SECTION_ORDER.includes(key)) : V8_SECTION_ORDER.filter((key) => key !== "blocking");
    if (!sectionOrder.includes("blocking")) {
      const optionsIndex = sectionOrder.indexOf("options");
      sectionOrder.splice(
        optionsIndex >= 0 ? optionsIndex : sectionOrder.length,
        0,
        "blocking"
      );
    }
    return {
      ...value,
      settings: {
        ...settings,
        blockedGamejobCompanies: Array.isArray(settings.blockedGamejobCompanies) ? settings.blockedGamejobCompanies : [],
        blockedGamejobPhrases: Array.isArray(settings.blockedGamejobPhrases) ? settings.blockedGamejobPhrases : [],
        sectionOrder,
        sections: {
          ...settings.sections ?? {},
          blocking: true
        }
      },
      schemaVersion: 7
    };
  }
  function migrateV7ToV8(value) {
    const settings = value.settings ?? {};
    const legacyPostingIds = Array.isArray(settings.blockedGamejobPostingIds) ? settings.blockedGamejobPostingIds : [];
    const blockedGamejobPostings = Array.isArray(settings.blockedGamejobPostings) ? settings.blockedGamejobPostings : legacyPostingIds.map((id) => ({
      id: String(id),
      title: null,
      blockedAt: null
    }));
    const { blockedGamejobPostingIds: _legacyPostingIds, ...remainingSettings } = settings;
    return {
      ...value,
      settings: {
        ...remainingSettings,
        blockedGamejobPostings,
        blockingGroups: {
          companies: settings.blockingGroups?.companies ?? true,
          phrases: settings.blockingGroups?.phrases ?? true,
          postings: settings.blockingGroups?.postings ?? true
        }
      },
      schemaVersion: 8
    };
  }
  function migrateV8ToV9(value) {
    const settings = value.settings ?? {};
    const sectionOrder = (Array.isArray(settings.sectionOrder) ? settings.sectionOrder : V8_SECTION_ORDER).map((key) => key === "blocking" ? "enhancedSearch" : key);
    for (const key of DEFAULT_SECTION_ORDER) {
      if (!sectionOrder.includes(key)) sectionOrder.push(key);
    }
    const sections = { ...settings.sections ?? {} };
    const enhancedSearchOpen = sections.enhancedSearch ?? sections.blocking ?? true;
    delete sections.blocking;
    delete sections.options;
    const {
      debugPosition: _debugPosition,
      blockedGamejobPostings: _blockedPostings,
      blockedGamejobCompanies: _blockedCompanies,
      blockedGamejobPhrases: _blockedPhrases,
      blockingGroups: _blockingGroups,
      ...remainingSettings
    } = settings;
    return {
      ...value,
      settings: {
        ...remainingSettings,
        positionLocked: settings.positionLocked ?? false,
        embedded: settings.embedded ?? false,
        gamejobHiddenPostings: Array.isArray(settings.gamejobHiddenPostings) ? settings.gamejobHiddenPostings : Array.isArray(settings.blockedGamejobPostings) ? settings.blockedGamejobPostings : [],
        gamejobHiddenCompanies: Array.isArray(settings.gamejobHiddenCompanies) ? settings.gamejobHiddenCompanies : Array.isArray(settings.blockedGamejobCompanies) ? settings.blockedGamejobCompanies : [],
        gamejobHidePhrases: Array.isArray(settings.gamejobHidePhrases) ? settings.gamejobHidePhrases : Array.isArray(settings.blockedGamejobPhrases) ? settings.blockedGamejobPhrases : [],
        gamejobHideExceptions: Array.isArray(settings.gamejobHideExceptions) ? settings.gamejobHideExceptions : [],
        gamejobFocusMode: settings.gamejobFocusMode ?? false,
        gamejobFocusKeywords: Array.isArray(settings.gamejobFocusKeywords) ? settings.gamejobFocusKeywords : [],
        gamejobFocusPriority: settings.gamejobFocusPriority ?? false,
        enhancedSearchGroups: {
          companies: settings.enhancedSearchGroups?.companies ?? settings.blockingGroups?.companies ?? true,
          hidePhrases: settings.enhancedSearchGroups?.hidePhrases ?? settings.blockingGroups?.phrases ?? true,
          hideExceptions: settings.enhancedSearchGroups?.hideExceptions ?? true,
          focusKeywords: settings.enhancedSearchGroups?.focusKeywords ?? true,
          postings: settings.enhancedSearchGroups?.postings ?? settings.blockingGroups?.postings ?? true
        },
        enhancedSearchOrder: Array.isArray(settings.enhancedSearchOrder) ? settings.enhancedSearchOrder : [
          "companies",
          "hidePhrases",
          "hideExceptions",
          "focusKeywords",
          "postings"
        ],
        sectionOrder: [...new Set(sectionOrder)].filter(
          (key) => DEFAULT_SECTION_ORDER.includes(key)
        ),
        sectionVisibility: {
          companyInfo: settings.sectionVisibility?.companyInfo ?? true,
          postingDetails: settings.sectionVisibility?.postingDetails ?? true,
          pastPostings: settings.sectionVisibility?.pastPostings ?? true,
          workforce: settings.sectionVisibility?.workforce ?? true,
          postings: settings.sectionVisibility?.postings ?? true,
          officialWorkforce: settings.sectionVisibility?.officialWorkforce ?? true,
          enhancedSearch: settings.sectionVisibility?.enhancedSearch ?? true
        },
        sections: { ...sections, enhancedSearch: enhancedSearchOpen }
      },
      schemaVersion: 9
    };
  }
  function migrateV9ToV10(value) {
    const settings = value.settings ?? {};
    const { visible: _legacyVisible, ...remainingSettings } = settings;
    return {
      ...value,
      settings: {
        ...remainingSettings,
        theme: ["white", "blue", "contrast"].includes(settings.theme) ? settings.theme : "white"
      },
      schemaVersion: 10
    };
  }
  function migrateV10ToV11(value) {
    const settings = value.settings ?? {};
    return {
      ...value,
      settings: {
        ...settings,
        // The high-contrast experiment was removed. Existing users return to
        // white rather than retaining a UI choice that can no longer be edited.
        theme: normalizePanelTheme(settings.theme),
        panelTone: normalizePanelTone(settings.panelTone),
        panelToneIntensity: normalizePanelToneIntensity(
          settings.panelToneIntensity
        )
      },
      schemaVersion: 11
    };
  }
  function migrateV11ToV12(value) {
    const { pensionRemoteJsonUrl: _removed, ...settings } = value.settings ?? {};
    return {
      ...value,
      settings,
      schemaVersion: 12
    };
  }
  function migrateV12ToV13(value) {
    const settings = value.settings ?? {};
    const sectionOrder = Array.isArray(settings.sectionOrder) ? settings.sectionOrder.filter((key) => key !== "pensionData") : [...DEFAULT_SECTION_ORDER];
    const workforceIndex = sectionOrder.indexOf("workforce");
    sectionOrder.splice(
      workforceIndex >= 0 ? workforceIndex + 1 : sectionOrder.length,
      0,
      "pensionData"
    );
    return {
      ...value,
      settings: {
        ...settings,
        sectionOrder,
        sections: { ...settings.sections ?? {}, pensionData: true },
        sectionVisibility: {
          ...settings.sectionVisibility ?? {},
          pensionData: true
        }
      },
      schemaVersion: 13
    };
  }
  function migrateV13ToV14(value) {
    return {
      ...value,
      // 검색 캐시와 사용자가 고정한 바인드는 독립적으로 보존한다.
      pensionMatches: normalizePensionMatches(value.pensionMatches),
      schemaVersion: 14
    };
  }
  function migrateV14ToV15(value) {
    return {
      ...value,
      pensionPolicy: normalizePensionPolicy(value.pensionPolicy),
      schemaVersion: 15
    };
  }
  function migrateV15ToV16(value) {
    const settings = { ...value.settings ?? {} };
    delete settings.manualGamejobPostingSave;
    return {
      ...value,
      settings,
      // v16 is the intentional reset point for the save subsystem. Do not carry
      // automatic observations or posting revision arrays into the new model.
      companies: Object.fromEntries(
        Object.entries(value.companies ?? {}).map(([companyId, company]) => [
          companyId,
          resetLegacyCompanySaves(company)
        ])
      ),
      schemaVersion: 16
    };
  }
  function migrateV16ToV17(value) {
    const settings = { ...value.settings ?? {} };
    const sections = { ...settings.sections ?? {} };
    const sectionVisibility = { ...settings.sectionVisibility ?? {} };
    delete sections.officialWorkforce;
    delete sectionVisibility.officialWorkforce;
    return {
      ...value,
      settings: {
        ...settings,
        sectionOrder: (Array.isArray(settings.sectionOrder) ? settings.sectionOrder : []).filter(
          (key) => key !== "officialWorkforce"
        ),
        sections,
        sectionVisibility
      },
      companies: Object.fromEntries(
        Object.entries(value.companies ?? {}).map(([companyId, company]) => {
          const workforce = company?.gamejobOfficialWorkforce ?? null;
          return [
            companyId,
            {
              ...company,
              companyAlerts: Array.isArray(company?.companyAlerts) ? company.companyAlerts : [],
              gamejobOfficialWorkforceHistory: workforce ? [workforce] : [],
              gamejobPostingDetails: company?.gamejobPostingDetails && typeof company.gamejobPostingDetails === "object" ? company.gamejobPostingDetails : {}
            }
          ];
        })
      ),
      schemaVersion: 17
    };
  }
  function migrateV17ToV18(value) {
    return {
      ...value,
      pensionMatches: normalizePensionMatches(value.pensionMatches),
      schemaVersion: 18
    };
  }
  function migrateV18ToV19(value) {
    const settings = { ...value.settings ?? {} };
    return {
      ...value,
      settings: {
        ...settings,
        sectionOrder: prioritizePrimarySections(settings.sectionOrder)
      },
      schemaVersion: 19
    };
  }
  var MIGRATIONS = /* @__PURE__ */ new Map([
    [0, migrateV0ToV1],
    [1, migrateV1ToV2],
    [2, migrateV2ToV3],
    [3, migrateV3ToV4],
    [4, migrateV4ToV5],
    [5, migrateV5ToV6],
    [6, migrateV6ToV7],
    [7, migrateV7ToV8],
    [8, migrateV8ToV9],
    [9, migrateV9ToV10],
    [10, migrateV10ToV11],
    [11, migrateV11ToV12],
    [12, migrateV12ToV13],
    [13, migrateV13ToV14],
    [14, migrateV14ToV15],
    [15, migrateV15ToV16],
    [16, migrateV16ToV17],
    [17, migrateV17ToV18],
    [18, migrateV18ToV19]
  ]);
  function migrateData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return createEmptyData();
    let current = clone(value);
    let version = Number.isInteger(current.schemaVersion) ? current.schemaVersion : 0;
    if (version > SCHEMA_VERSION) {
      throw new Error(`\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 Hayoung4 \uB370\uC774\uD130 \uBC84\uC804\uC785\uB2C8\uB2E4: ${version}`);
    }
    while (version < SCHEMA_VERSION) {
      const migration = MIGRATIONS.get(version);
      if (!migration)
        throw new Error(`v${version} \uB370\uC774\uD130 \uB9C8\uC774\uADF8\uB808\uC774\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      current = migration(current);
      version = current.schemaVersion;
    }
    const empty = createEmptyData();
    const {
      pensionRemoteJsonUrl: _removedRemoteUrl,
      manualGamejobPostingSave: _removedManualPostingSave,
      ...currentSettings
    } = current.settings ?? {};
    return {
      ...empty,
      ...current,
      settings: {
        ...empty.settings,
        ...currentSettings,
        sections: {
          ...empty.settings.sections,
          ...current.settings?.sections ?? {}
        },
        sectionOrder: Array.isArray(current.settings?.sectionOrder) ? current.settings.sectionOrder : empty.settings.sectionOrder,
        gamejobHiddenPostings: Array.isArray(
          current.settings?.gamejobHiddenPostings
        ) ? current.settings.gamejobHiddenPostings : [],
        gamejobHiddenCompanies: Array.isArray(
          current.settings?.gamejobHiddenCompanies
        ) ? current.settings.gamejobHiddenCompanies : [],
        gamejobHidePhrases: Array.isArray(current.settings?.gamejobHidePhrases) ? current.settings.gamejobHidePhrases : [],
        gamejobHideExceptions: Array.isArray(
          current.settings?.gamejobHideExceptions
        ) ? current.settings.gamejobHideExceptions : [],
        gamejobFocusKeywords: Array.isArray(
          current.settings?.gamejobFocusKeywords
        ) ? current.settings.gamejobFocusKeywords : [],
        enhancedSearchGroups: {
          ...empty.settings.enhancedSearchGroups,
          ...current.settings?.enhancedSearchGroups ?? {}
        },
        enhancedSearchOrder: Array.isArray(current.settings?.enhancedSearchOrder) ? current.settings.enhancedSearchOrder : empty.settings.enhancedSearchOrder,
        sectionVisibility: {
          ...empty.settings.sectionVisibility,
          ...current.settings?.sectionVisibility ?? {}
        },
        theme: normalizePanelTheme(current.settings?.theme),
        panelTone: normalizePanelTone(current.settings?.panelTone),
        panelToneIntensity: normalizePanelToneIntensity(
          current.settings?.panelToneIntensity
        ),
        size: normalizePanelSize(current.settings?.size)
      },
      companies: current.companies && typeof current.companies === "object" ? Object.fromEntries(
        Object.entries(current.companies).map(([companyId, company]) => [
          companyId,
          normalizeCompanyRecord(company)
        ])
      ) : {},
      workforceRecords: Array.isArray(current.workforceRecords) ? current.workforceRecords : [],
      pensionMatches: normalizePensionMatches(current.pensionMatches),
      pensionPolicy: normalizePensionPolicy(current.pensionPolicy),
      schemaVersion: SCHEMA_VERSION
    };
  }

  // src/storage.js
  var ROOT_KEY = "hayoung:data";
  function clone2(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function storageArea() {
    if (!globalThis.chrome?.storage?.local) {
      throw new Error("Chrome local storage\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    return chrome.storage.local;
  }
  async function get(key, fallback = null) {
    return new Promise((resolve, reject) => {
      storageArea().get(key, (result) => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result?.[key] ?? fallback);
      });
    });
  }
  async function set(key, value) {
    return new Promise((resolve, reject) => {
      storageArea().set({ [key]: value }, () => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  async function remove(key) {
    return new Promise((resolve, reject) => {
      storageArea().remove(key, () => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  async function loadData() {
    return migrateData(await get(ROOT_KEY));
  }
  async function saveData(data) {
    const next = {
      ...data,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await set(ROOT_KEY, next);
    return next;
  }
  var updateDataQueue = Promise.resolve();
  function updateData(mutator) {
    const operation = updateDataQueue.catch(() => {
    }).then(async () => {
      const current = await loadData();
      const next = await mutator(clone2(current)) ?? current;
      return saveData(next);
    });
    updateDataQueue = operation.catch(() => {
    });
    return operation;
  }
  function ensureCompanyRecord(data, company) {
    const existing = data.companies[company.id];
    const record = existing ? normalizeCompanyRecord(existing, company) : createCompanyRecord(company);
    record.profile = { ...record.profile, ...company };
    data.companies[company.id] = record;
    return record;
  }
  function cacheCompanyProfile(company) {
    if (!company?.id) return loadData();
    return updateData((data) => {
      ensureCompanyRecord(data, company);
      return data;
    });
  }
  function saveGamejobListCompanyInformation(company, information) {
    if (!company?.id) return loadData();
    return updateData((data) => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const existing = ensureCompanyRecord(data, company);
      existing.profile = {
        ...existing.profile,
        ...company,
        address: information?.address ?? existing.profile?.address ?? null
      };
      const postingCountsUpdated = Number.isFinite(information?.openPostingCount) || Number.isFinite(information?.closedPostingCount);
      existing.gamejobListInformation = {
        employeeCount: Number.isFinite(information?.employeeCount) ? information.employeeCount : existing.gamejobListInformation?.employeeCount ?? null,
        totalPostingCount: Number.isFinite(information?.totalPostingCount) ? information.totalPostingCount : existing.gamejobListInformation?.totalPostingCount ?? null,
        openPostingCount: Number.isFinite(information?.openPostingCount) ? information.openPostingCount : existing.gamejobListInformation?.openPostingCount ?? null,
        closedPostingCount: Number.isFinite(information?.closedPostingCount) ? information.closedPostingCount : existing.gamejobListInformation?.closedPostingCount ?? null,
        sourceUrl: information?.sourceUrl ?? existing.gamejobListInformation?.sourceUrl ?? company.url ?? null,
        recruitmentSourceUrl: information?.recruitmentSourceUrl ?? existing.gamejobListInformation?.recruitmentSourceUrl ?? null,
        postingCountsUpdatedAt: postingCountsUpdated ? now : existing.gamejobListInformation?.postingCountsUpdatedAt ?? null,
        updatedAt: now
      };
      data.companies[company.id] = existing;
      return data;
    });
  }
  function saveListedPosting(company, posting) {
    if (!company?.id || !posting?.id) return loadData();
    return updateData((data) => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const storedCompany = ensureCompanyRecord(data, company);
      const savedPosting = createSavedPosting(
        posting,
        storedCompany.postings[posting.id],
        now
      );
      if (!savedPosting) {
        throw new Error("\uBAA9\uB85D \uACF5\uACE0\uC758 \uC81C\uBAA9 \uB610\uB294 URL\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
      storedCompany.postings[posting.id] = savedPosting;
      return data;
    });
  }
  function saveGamejobOfficialWorkforce(company, employeeCount) {
    if (!company?.id?.startsWith("gamejob:")) {
      throw new Error("\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218\uB9CC \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    const workforce = createGamejobOfficialWorkforce(employeeCount);
    if (!workforce)
      throw new Error("\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return updateData((data) => {
      const storedCompany = ensureCompanyRecord(data, company);
      storedCompany.gamejobOfficialWorkforceHistory = [
        workforce,
        ...storedCompany.gamejobOfficialWorkforceHistory.filter(
          (record) => record.id !== workforce.id
        )
      ];
      storedCompany.gamejobOfficialWorkforce = workforce;
      return data;
    });
  }
  function deleteGamejobOfficialWorkforceRecord(companyId, recordId2) {
    if (!companyId?.startsWith("gamejob:") || !recordId2) {
      throw new Error(
        "\uC0AD\uC81C\uD560 \uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218 \uAE30\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
      );
    }
    return updateData((data) => {
      const storedCompany = data.companies[companyId];
      if (!storedCompany) throw new Error("\uC800\uC7A5\uB41C \uD68C\uC0AC \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const normalized = normalizeCompanyRecord(storedCompany);
      normalized.gamejobOfficialWorkforceHistory = normalized.gamejobOfficialWorkforceHistory.filter(
        (record) => record.id !== recordId2
      );
      normalized.gamejobOfficialWorkforce = normalized.gamejobOfficialWorkforceHistory[0] ?? null;
      data.companies[companyId] = normalized;
      return data;
    });
  }
  function saveGamejobPostingDetail(company, posting) {
    if (!company?.id?.startsWith("gamejob:")) {
      throw new Error("\uAC8C\uC784\uC7A1 \uC0C1\uC138 \uACF5\uACE0\uB9CC \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    const record = createGamejobPostingDetailRecord(posting);
    if (!record) throw new Error("\uC0C1\uC138 \uACF5\uACE0\uC758 \uC800\uC7A5 \uD544\uB4DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return updateData((data) => {
      const storedCompany = ensureCompanyRecord(data, company);
      const previous = storedCompany.gamejobPostingDetails[posting.id];
      const previousRecords = previous?.records ?? [];
      const sameSnapshot = previousRecords.find(
        (item) => item.title === record.title && item.registeredAt === record.registeredAt && item.registeredText === record.registeredText && item.lastModifiedAt === record.lastModifiedAt && item.lastModifiedText === record.lastModifiedText
      );
      storedCompany.gamejobPostingDetails[posting.id] = {
        id: posting.id,
        title: posting.title,
        url: posting.url,
        records: sameSnapshot ? previousRecords : [record, ...previousRecords]
      };
      return data;
    });
  }
  async function updateSettings(patch) {
    return updateData((data) => {
      data.settings = {
        ...data.settings,
        ...patch,
        sections: patch.sections ? { ...data.settings.sections, ...patch.sections } : data.settings.sections,
        enhancedSearchGroups: patch.enhancedSearchGroups ? {
          ...data.settings.enhancedSearchGroups,
          ...patch.enhancedSearchGroups
        } : data.settings.enhancedSearchGroups,
        sectionVisibility: patch.sectionVisibility ? {
          ...data.settings.sectionVisibility,
          ...patch.sectionVisibility
        } : data.settings.sectionVisibility
      };
      return data;
    });
  }
  async function selectWorkforceCompany(companyId, workforceCode) {
    return updateData((data) => {
      const company = data.companies[companyId];
      if (!company) throw new Error("\uC800\uC7A5\uB41C \uD68C\uC0AC \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      company.workforceCode = workforceCode || null;
      return data;
    });
  }
  async function cachePensionCompanyMatch(sourceName, target) {
    const key = getPensionSourceKey(sourceName);
    const record = createPensionMatchRecord(sourceName, target, "cache");
    if (!key || !record)
      throw new Error("\uC5F0\uAE08 \uAC80\uC0C9 \uCE90\uC2DC \uB300\uC0C1\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return updateData((data) => {
      data.pensionMatches.cache[key] = record;
      return data;
    });
  }
  async function bindPensionCompany(sourceName, target) {
    const key = getPensionSourceKey(sourceName);
    const record = createPensionMatchRecord(sourceName, target, "manual");
    if (!key || !record)
      throw new Error("\uC218\uB3D9 \uBC14\uC778\uB4DC \uB300\uC0C1\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return updateData((data) => {
      data.pensionMatches.binds[key] = record;
      delete data.pensionMatches.directoryOptOuts[key];
      return data;
    });
  }
  async function unbindPensionCompany(sourceName) {
    const key = getPensionSourceKey(sourceName);
    const optOut = createPensionDirectoryOptOutRecord(sourceName);
    if (!key || !optOut)
      throw new Error("\uBC14\uC778\uB4DC\uB97C \uD574\uC81C\uD560 \uD68C\uC0AC\uBA85\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return updateData((data) => {
      delete data.pensionMatches.binds[key];
      data.pensionMatches.directoryOptOuts[key] = optOut;
      return data;
    });
  }
  async function recordPensionPolicyCheck(requiredLatestMonth, checkedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    const month = normalizePensionMonth(requiredLatestMonth);
    if (!month) throw new Error("\uACF5\uACF5\uB370\uC774\uD130 \uCD5C\uC2E0 \uC6D4\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return updateData((data) => {
      data.pensionPolicy = normalizePensionPolicy({
        ...data.pensionPolicy,
        requiredLatestMonth: month,
        checkedAt
      });
      return data;
    });
  }
  async function recordBundledPensionSeedApplied(version = null) {
    return updateData((data) => {
      data.pensionPolicy = normalizePensionPolicy({
        ...data.pensionPolicy,
        bundledSeedApplied: true,
        bundledSeedVersion: version
      });
      return data;
    });
  }
  async function saveWorkforceRecords(records) {
    if (!Array.isArray(records))
      throw new Error("\uC778\uB825 \uB370\uC774\uD130\uB294 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    return updateData((data) => {
      data.workforceRecords = records;
      return data;
    });
  }
  async function clearAllData() {
    await remove(ROOT_KEY);
    return createEmptyData();
  }
  function getOpenPostingCount(companyData) {
    return Object.values(companyData?.postings ?? {}).filter(
      (posting) => posting.status === "open"
    ).length;
  }
  function getLatestEmployeeCount(companyData) {
    return companyData?.gamejobOfficialWorkforce?.employeeCount ?? null;
  }

  // src/workforce-directory.js
  function createInMemoryWorkforceDirectory(records = []) {
    const snapshot = Array.isArray(records) ? [...records] : [];
    return Object.freeze({
      recordCount: snapshot.length,
      findCandidates(company, limit = 5) {
        return findCompanyCandidates(company, snapshot, limit);
      }
    });
  }

  // src/gamejob-simple-mode.js
  var GAMEJOB_POSTING_COUNT_STALE_MS = 60 * 60 * 1e3;
  function finite(value) {
    return Number.isFinite(value) ? value : null;
  }
  function isGamejobPostingCountUpdateRecommended(updatedAt, now = Date.now()) {
    const updatedTime = new Date(updatedAt ?? "").getTime();
    const currentTime = now instanceof Date ? now.getTime() : Number(now);
    return Number.isFinite(updatedTime) && Number.isFinite(currentTime) && currentTime - updatedTime > GAMEJOB_POSTING_COUNT_STALE_MS;
  }
  function resolveGamejobPostingCountSummary({
    cachedInformation,
    recruitments,
    companyInformation
  } = {}) {
    const recruitmentHasDetails = Number.isFinite(recruitments?.openCount) || Number.isFinite(recruitments?.closedCount);
    const cachedHasDetails = Number.isFinite(cachedInformation?.openPostingCount) || Number.isFinite(cachedInformation?.closedPostingCount);
    const detailSource = recruitmentHasDetails ? {
      open: finite(recruitments.openCount),
      closed: finite(recruitments.closedCount),
      updatedAt: recruitments.countsUpdatedAt ?? null
    } : cachedHasDetails ? {
      open: finite(cachedInformation.openPostingCount),
      closed: finite(cachedInformation.closedPostingCount),
      updatedAt: cachedInformation.postingCountsUpdatedAt ?? cachedInformation.updatedAt ?? null
    } : { open: null, closed: null, updatedAt: null };
    const explicitTotal = finite(recruitments?.totalCount) ?? finite(cachedInformation?.totalPostingCount) ?? finite(companyInformation?.totalPostingCount);
    const derivedTotal = Number.isFinite(detailSource.open) && Number.isFinite(detailSource.closed) ? detailSource.open + detailSource.closed : null;
    return {
      total: explicitTotal ?? derivedTotal,
      open: detailSource.open,
      closed: detailSource.closed,
      updatedAt: detailSource.updatedAt,
      hasDetails: Number.isFinite(detailSource.open) || Number.isFinite(detailSource.closed)
    };
  }

  // src/posting-alerts.js
  var SIX_MONTHS = 6;
  var POSTING_ALERT_TONES = Object.freeze({
    highest: "very very very safe",
    high: "very very safe",
    standard: "very safe",
    fallback: "safe"
  });
  function finite2(value) {
    return Number.isFinite(value) ? value : null;
  }
  function dateKey2(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  function sixMonthsAfter2(value) {
    const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + SIX_MONTHS);
    return date.toISOString().slice(0, 10);
  }
  function formatKoreanDate(value) {
    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value ?? "");
  }
  function formatRatio(value) {
    return Number(value.toFixed(2)).toLocaleString("ko-KR");
  }
  function findLargestSixMonthCluster(entries) {
    const sorted = [...entries].sort(
      (left2, right) => left2.date.localeCompare(right.date)
    );
    let best = [];
    let left = 0;
    for (let right = 0; right < sorted.length; right += 1) {
      while (sorted[right].date > sixMonthsAfter2(sorted[left].date)) left += 1;
      const cluster = sorted.slice(left, right + 1);
      if (cluster.length >= best.length) best = cluster;
    }
    return best;
  }
  function getJobkoreaDuplicateAlert(viewModel) {
    const posting = viewModel.posting;
    const titleKey = normalizePostingTitle(posting?.title);
    const recruitments = viewModel.pastRecruitments;
    if (!titleKey || !Array.isArray(recruitments?.postings)) return null;
    const candidates = [...recruitments.postings, posting];
    const unique = /* @__PURE__ */ new Map();
    for (const item of candidates) {
      if (normalizePostingTitle(item?.title) !== titleKey) continue;
      const publishedDate = dateKey2(item.openedAt ?? item.registeredAt);
      const deadlineDate = dateKey2(item.deadline);
      const date = publishedDate ?? deadlineDate;
      if (!date) continue;
      const key = item.id ?? item.url ?? `${titleKey}:${date}`;
      unique.set(key, {
        date,
        basis: publishedDate ? "published" : "deadline"
      });
    }
    const cluster = findLargestSixMonthCluster([...unique.values()]);
    if (cluster.length < 3) return null;
    const recent = [...cluster].sort(
      (left, right) => right.date.localeCompare(left.date)
    );
    const shown = recent.slice(0, 5).map((item) => formatKoreanDate(item.date));
    const remainder = recent.length > shown.length ? ` \uC678 ${recent.length - shown.length}\uAC74` : "";
    const onlyPublishedDates = recent.every((item) => item.basis === "published");
    return {
      code: "jobkorea-repeated-title",
      priority: 1,
      tone: POSTING_ALERT_TONES.highest,
      text: onlyPublishedDates ? `\uD574\uB2F9 \uC774\uB984\uACFC \uC720\uC0AC\uD55C \uACF5\uACE0\uAC00 \uC7A1\uCF54\uB9AC\uC544 \uAE30\uC900 ${shown.join(", ")}${remainder}\uC5D0 \uAC8C\uC2DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uACF5\uACE0 \uBAA9\uB85D\uC5D0\uC11C \uD655\uC778\uD574\uC8FC\uC138\uC694.` : `\uD574\uB2F9 \uC774\uB984\uACFC \uC720\uC0AC\uD55C \uACF5\uACE0\uAC00 6\uAC1C\uC6D4 \uB0B4 ${cluster.length}\uD68C \uD655\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A1\uCF54\uB9AC\uC544 \uBAA9\uB85D\uC5D0 \uB4F1\uB85D\uC77C\uC774 \uC5C6\uC5B4 \uB9C8\uAC10\uC77C ${shown.join(", ")}${remainder} \uAE30\uC900\uC73C\uB85C \uACC4\uC0B0\uD588\uC2B5\uB2C8\uB2E4. \uACF5\uACE0 \uBAA9\uB85D\uC5D0\uC11C \uD655\uC778\uD574\uC8FC\uC138\uC694.`
    };
  }
  function getGamejobModificationAlert(viewModel) {
    const records = viewModel.companyData?.gamejobPostingDetails?.[viewModel.posting?.id]?.records ?? [];
    const companyName = String(viewModel.company?.name ?? "").trim();
    if (records.length < 3 || !companyName) return null;
    return {
      code: "gamejob-repeated-modification",
      priority: 1,
      tone: POSTING_ALERT_TONES.highest,
      text: `\uAC8C\uC784\uC7A1 \uC0AC\uC5C5\uC7A5[${companyName}]\uC758 \uD574\uB2F9 \uACF5\uACE0\uB294 \uB85C\uCEEC \uAE30\uB85D \uAE30\uC900 ${records.length}\uBC88 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C1\uC138 \uAE30\uB85D\uC5D0\uC11C \uD655\uC778\uD574\uC8FC\uC138\uC694.`
    };
  }
  function getDefaultBoundPensionResult(viewModel) {
    return (viewModel.pensionPoolUi?.results ?? []).find(
      (result) => result.directoryBind === true
    );
  }
  function getGamejobPostingTotal(viewModel) {
    return getGamejobPostingSummary(viewModel).total;
  }
  function getGamejobPostingSummary(viewModel) {
    return resolveGamejobPostingCountSummary({
      cachedInformation: viewModel.companyData?.gamejobListInformation,
      recruitments: viewModel.pastRecruitments,
      companyInformation: viewModel.recruitmentCompanyInfo
    });
  }
  function getGamejobNoJoinAlert(viewModel) {
    const result = getDefaultBoundPensionResult(viewModel);
    const latest = result?.latest;
    const postingCount = getGamejobPostingTotal(viewModel);
    const companyName = String(viewModel.company?.name ?? "").trim();
    const month = formatPensionMonth(latest?.month);
    if (!result?.name || !month || latest.joined !== 0 || !Number.isFinite(postingCount) || !companyName) {
      return null;
    }
    return {
      code: "gamejob-zero-join",
      priority: 2,
      tone: POSTING_ALERT_TONES.high,
      text: `\uAD6D\uBBFC\uC5F0\uAE08 \uC0AC\uC5C5\uC7A5[${result.name}]\uC758 ${month} \uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218\uB294 0\uBA85\uC785\uB2C8\uB2E4. \uAC8C\uC784\uC7A1 \uC0AC\uC5C5\uC7A5[${companyName}]\uC758 \uC804\uCCB4 \uACF5\uACE0 \uC218\uB294 ${postingCount.toLocaleString("ko-KR")}\uAC1C\uC785\uB2C8\uB2E4.`
    };
  }
  function getJobkoreaPostingWorkforceAlert(viewModel) {
    const information = viewModel.recruitmentCompanyInfo;
    const employeeCount = finite2(information?.employeeCount);
    const postingCount = finite2(information?.employmentHistory?.totalCount);
    if (!information?.informationLoaded || !Number.isFinite(employeeCount) || employeeCount <= 0 || !Number.isFinite(postingCount) || postingCount <= employeeCount) {
      return null;
    }
    return {
      code: "jobkorea-postings-over-workforce",
      priority: 2,
      tone: POSTING_ALERT_TONES.high,
      text: `\uC7A1\uCF54\uB9AC\uC544 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218\uB294 ${employeeCount.toLocaleString("ko-KR")}\uBA85\uC785\uB2C8\uB2E4. 3\uB144\uAC04 \uACF5\uACE0\uB294 ${postingCount.toLocaleString("ko-KR")}\uAC1C\uAC00 \uAC8C\uC2DC\uB418\uC5C8\uC73C\uBA70, \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218\uC758 ${formatRatio(postingCount / employeeCount)}\uBC30\uC758 \uACF5\uACE0\uAC00 \uAC8C\uC2DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`
    };
  }
  function formatPensionMonth(value) {
    const match = String(value ?? "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    return match ? `${match[1]}\uB144 ${Number(match[2])}\uC6D4` : null;
  }
  function isUsableAlert(alert) {
    if (!alert || !String(alert.text ?? "").trim()) return false;
    return !/(확인 불가|계산 불가|계산할 수 없|나누기\s*0|÷\s*0)/.test(
      alert.text
    );
  }
  function getGamejobJoinOverOpenPostingsAlert(viewModel) {
    const result = getDefaultBoundPensionResult(viewModel);
    const latest = result?.latest;
    const openPostingCount = getGamejobPostingSummary(viewModel).open;
    const companyName = String(viewModel.company?.name ?? "").trim();
    const month = formatPensionMonth(latest?.month);
    if (!result?.name || !month || !Number.isFinite(latest.joined) || latest.joined <= 0 || !Number.isFinite(openPostingCount) || openPostingCount <= 0 || latest.joined <= openPostingCount || !companyName) {
      return null;
    }
    const joined = latest.joined.toLocaleString("ko-KR");
    const open = openPostingCount.toLocaleString("ko-KR");
    const joinedPerPosting = formatRatio(latest.joined / openPostingCount);
    return {
      code: "gamejob-joins-over-open-postings",
      priority: 4,
      tone: POSTING_ALERT_TONES.standard,
      text: `\uAD6D\uBBFC\uC5F0\uAE08 \uC0AC\uC5C5\uC7A5[${result.name}]\uC758 ${month} \uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218\uB294 ${joined}\uBA85\uC785\uB2C8\uB2E4. \uAC8C\uC784\uC7A1 \uC0AC\uC5C5\uC7A5[${companyName}]\uC758 \uD604\uC7AC \uD65C\uC131 \uACF5\uACE0\uB294 ${open}\uAC1C\uC785\uB2C8\uB2E4. \uD604\uC7AC ${open}\uAC1C\uC758 \uACF5\uACE0\uB2F9 ${month} \uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218\uB294 ${joinedPerPosting}\uBA85\uC785\uB2C8\uB2E4.`
    };
  }
  function getFallbackAlert(viewModel) {
    if (viewModel.site?.id === "jobkorea") {
      const applicants = viewModel.posting?.applicantCount;
      const applicantText = viewModel.posting?.applicantCountText === "3\uBA85 \uBBF8\uB9CC" ? "3\uBA85 \uBBF8\uB9CC" : Number.isFinite(applicants) ? `${applicants.toLocaleString("ko-KR")}\uBA85` : "-";
      return {
        code: "jobkorea-applicants",
        priority: 99,
        tone: POSTING_ALERT_TONES.fallback,
        text: `\uD604\uC7AC \uACF5\uACE0\uC758 \uC9C0\uC6D0\uC790 \uC218\uB294 ${applicantText}\uC785\uB2C8\uB2E4.`
      };
    }
    const employeeCount = viewModel.officialEmployeeCount;
    const companyName = String(viewModel.company?.name ?? "").trim();
    const employeeText = Number.isFinite(employeeCount) ? `${employeeCount.toLocaleString("ko-KR")}\uBA85` : "-";
    return {
      code: "gamejob-official-workforce",
      priority: 99,
      tone: POSTING_ALERT_TONES.fallback,
      text: `${companyName ? `\uAC8C\uC784\uC7A1 \uC0AC\uC5C5\uC7A5[${companyName}]\uC758 ` : ""}\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218\uB294 ${employeeText}\uC785\uB2C8\uB2E4.`
    };
  }
  function createPostingAlert(viewModel) {
    if (!viewModel || !viewModel.posting && viewModel.pageType !== "posting") {
      return null;
    }
    const candidates = viewModel.site?.id === "jobkorea" ? [
      getJobkoreaDuplicateAlert(viewModel),
      getJobkoreaPostingWorkforceAlert(viewModel)
    ] : viewModel.site?.id === "gamejob" ? [
      getGamejobModificationAlert(viewModel),
      getGamejobNoJoinAlert(viewModel),
      getGamejobJoinOverOpenPostingsAlert(viewModel)
    ] : [];
    return candidates.find(isUsableAlert) ?? [getFallbackAlert(viewModel)].find(isUsableAlert) ?? null;
  }

  // src/pension-pool.js
  var PENSION_POOL_SCHEMA_VERSION = 1;
  var OFFICIAL_PENSION_MIN_CURRENT_SUBSCRIBERS = 10;
  var COLUMN_ALIASES2 = Object.freeze({
    name: ["\uC0AC\uC5C5\uC7A5\uBA85", "\uC0AC\uC5C5\uCCB4\uBA85", "\uD68C\uC0AC\uBA85", "\uD558\uC601\uD68C\uC0AC\uBA85", "name", "companyname"],
    roadAddress: [
      "\uC0AC\uC5C5\uC7A5\uB3C4\uB85C\uBA85\uC0C1\uC138\uC8FC\uC18C",
      "\uC0AC\uC5C5\uC7A5\uB3C4\uB85C\uBA85\uC8FC\uC18C",
      "\uB3C4\uB85C\uBA85\uC8FC\uC18C",
      "address"
    ],
    lotAddress: ["\uC0AC\uC5C5\uC7A5\uC9C0\uBC88\uC0C1\uC138\uC8FC\uC18C", "\uC0AC\uC5C5\uC7A5\uC9C0\uBC88\uC8FC\uC18C", "\uC9C0\uBC88\uC8FC\uC18C"],
    month: [
      "\uC790\uB8CC\uC0DD\uC131\uB144\uC6D4",
      "\uAE30\uC900\uB144\uC6D4",
      "\uC790\uB8CC\uB144\uC6D4",
      "\uD558\uC601\uAE30\uC900\uC6D4",
      "month",
      "date"
    ],
    subscribers: [
      "\uAC00\uC785\uC790\uC218",
      "\uC0AC\uC5C5\uC7A5\uAC00\uC785\uC790\uC218",
      "\uD558\uC601\uAE30\uC900\uC6D4\uAC00\uC785\uC790\uC218",
      "subscribers",
      "employeecount"
    ],
    joined: [
      "\uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218",
      "\uCDE8\uB4DD\uC790\uC218",
      "\uD558\uC601\uAE30\uC900\uC6D4\uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218",
      "joined",
      "joinedcount"
    ],
    left: [
      "\uC0C1\uC2E4\uAC00\uC785\uC790\uC218",
      "\uC0C1\uC2E4\uC790\uC218",
      "\uD558\uC601\uAE30\uC900\uC6D4\uC0C1\uC2E4\uAC00\uC785\uC790\uC218",
      "left",
      "leftcount"
    ]
  });
  function nowIso2() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function clone3(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function normalizeMonth(value) {
    const match = cleanText(value).match(/^(\d{4})\D?([01]?\d)$/);
    if (!match) return null;
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, "0")}` : null;
  }
  function count(value, fallback = null) {
    const number = parseNumber(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.round(number));
  }
  function rowValue(row, indexes, key) {
    const index = indexes[key];
    return index >= 0 ? row[index] : null;
  }
  function validateColumns(indexes) {
    const missing = ["name", "month", "subscribers", "joined", "left"].filter(
      (key) => indexes[key] < 0
    );
    if (indexes.roadAddress < 0 && indexes.lotAddress < 0) {
      missing.push("address");
    }
    if (missing.length > 0) {
      throw new Error(
        `\uAD6D\uBBFC\uC5F0\uAE08 CSV \uD544\uC218 \uC5F4\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${missing.join(", ")}`
      );
    }
  }
  function recordKey({ name, address, month }) {
    return JSON.stringify([name, address, month]);
  }
  function parsePensionCsv(text) {
    const [headerRow, ...dataRows] = parseCsvRows(text);
    if (!headerRow) throw new Error("\uAD6D\uBBFC\uC5F0\uAE08 CSV\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    const indexes = resolveCsvColumnIndexes(headerRow, COLUMN_ALIASES2);
    validateColumns(indexes);
    const aggregated = /* @__PURE__ */ new Map();
    let skippedRows = 0;
    for (const row of dataRows) {
      const name = cleanText(rowValue(row, indexes, "name"));
      const address = cleanText(rowValue(row, indexes, "roadAddress")) || cleanText(rowValue(row, indexes, "lotAddress"));
      const month = normalizeMonth(rowValue(row, indexes, "month"));
      const subscribers = count(rowValue(row, indexes, "subscribers"));
      if (!name || !month || subscribers === null) {
        skippedRows += 1;
        continue;
      }
      const record = {
        name,
        address: address || null,
        month,
        subscribers,
        joined: count(rowValue(row, indexes, "joined"), 0),
        left: count(rowValue(row, indexes, "left"), 0)
      };
      const key = recordKey(record);
      const existing = aggregated.get(key);
      aggregated.set(
        key,
        existing ? {
          ...record,
          subscribers: existing.subscribers + record.subscribers,
          joined: existing.joined + record.joined,
          left: existing.left + record.left
        } : record
      );
    }
    const records = [...aggregated.values()];
    if (records.length === 0) {
      throw new Error("\uAC00\uACF5\uD560 \uC218 \uC788\uB294 \uAD6D\uBBFC\uC5F0\uAE08 \uB808\uCF54\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    return {
      records,
      diagnostics: {
        totalRows: dataRows.length,
        acceptedRows: dataRows.length - skippedRows,
        compressedRecords: records.length,
        skippedRows,
        months: [...new Set(records.map(({ month }) => month))].sort().reverse()
      }
    };
  }
  function createEmptyPensionPool() {
    const timestamp = nowIso2();
    return {
      schemaVersion: PENSION_POOL_SCHEMA_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
      sources: [],
      protectedCompanies: [],
      companyBindings: {},
      companies: {}
    };
  }
  function sortMonths(months = {}) {
    return Object.fromEntries(
      Object.entries(months).sort(([left], [right]) => right.localeCompare(left))
    );
  }
  function sortPool(pool) {
    const companies = Object.fromEntries(
      Object.entries(pool.companies ?? {}).sort(([left], [right]) => left.localeCompare(right, "ko")).map(([name, locations]) => [
        name,
        [...locations].sort(
          (left, right) => String(left.address ?? "").localeCompare(
            String(right.address ?? ""),
            "ko"
          )
        ).map((location2) => ({
          address: location2.address ?? null,
          months: sortMonths(location2.months)
        }))
      ])
    );
    const protectedCompanies = [
      ...new Set((pool.protectedCompanies ?? []).map(cleanText).filter(Boolean))
    ].sort((left, right) => left.localeCompare(right, "ko"));
    const companyBindings = Object.fromEntries(
      Object.entries(pool.companyBindings ?? {}).sort(
        ([left], [right]) => left.localeCompare(right)
      )
    );
    return { ...pool, protectedCompanies, companyBindings, companies };
  }
  function normalizePensionPool(value) {
    const empty = createEmptyPensionPool();
    if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
    if (value.schemaVersion !== void 0 && value.schemaVersion !== PENSION_POOL_SCHEMA_VERSION) {
      throw new Error(`\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC5F0\uAE08 \uD480 \uBC84\uC804\uC785\uB2C8\uB2E4: ${value.schemaVersion}`);
    }
    const pool = {
      ...empty,
      createdAt: cleanText(value.createdAt) || empty.createdAt,
      updatedAt: cleanText(value.updatedAt) || empty.updatedAt,
      sources: Array.isArray(value.sources) ? clone3(value.sources) : [],
      protectedCompanies: Array.isArray(value.protectedCompanies) ? value.protectedCompanies.map(cleanText).filter(Boolean) : [],
      companyBindings: value.companyBindings && typeof value.companyBindings === "object" ? Object.fromEntries(
        Object.entries(value.companyBindings).map(([key, binding]) => {
          const name = cleanText(binding?.name);
          return name ? [
            cleanText(key),
            {
              sourceName: cleanText(binding?.sourceName) || null,
              name,
              address: cleanText(binding?.address) || null
            }
          ] : null;
        }).filter(Boolean)
      ) : {},
      companies: {}
    };
    for (const [nameValue, locationsValue] of Object.entries(
      value.companies ?? {}
    )) {
      const name = cleanText(nameValue);
      if (!name || !Array.isArray(locationsValue)) continue;
      const locations = [];
      for (const location2 of locationsValue) {
        const months = {};
        for (const [monthValue, snapshot] of Object.entries(
          location2?.months ?? {}
        )) {
          const month = normalizeMonth(monthValue);
          const subscribers = count(snapshot?.subscribers);
          if (!month || subscribers === null) continue;
          months[month] = {
            subscribers,
            joined: count(snapshot?.joined, 0),
            left: count(snapshot?.left, 0)
          };
        }
        if (Object.keys(months).length > 0) {
          locations.push({
            address: cleanText(location2?.address) || null,
            months
          });
        }
      }
      if (locations.length > 0) pool.companies[name] = locations;
    }
    return sortPool(pool);
  }
  function deletePensionPoolMonth(poolValue, monthValue) {
    const pool = normalizePensionPool(poolValue);
    const month = normalizePensionMonth(monthValue);
    if (!month) throw new Error("\uC0AD\uC81C\uD560 \uC5F0\uAE08 \uC6D4\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    for (const [name, locations] of Object.entries(pool.companies)) {
      for (const location2 of locations) delete location2.months[month];
      pool.companies[name] = locations.filter(
        (location2) => Object.keys(location2.months).length > 0
      );
      if (pool.companies[name].length === 0) delete pool.companies[name];
    }
    pool.sources = pool.sources.map((source) => ({
      ...source,
      months: (source.months ?? []).filter(
        (sourceMonth) => normalizePensionMonth(sourceMonth) !== month
      )
    })).filter((source) => source.months.length > 0);
    pool.updatedAt = nowIso2();
    return sortPool(pool);
  }
  function applyPensionRecords(pool, records, source = {}) {
    for (const record of records) {
      const name = cleanText(record?.name);
      const month = normalizeMonth(record?.month);
      const subscribers = count(record?.subscribers);
      if (!name || !month || subscribers === null) continue;
      const address = cleanText(record?.address) || null;
      const locations = pool.companies[name] ?? [];
      let location2 = locations.find(
        (candidate) => (candidate.address ?? null) === address
      );
      if (!location2) {
        location2 = { address, months: {} };
        locations.push(location2);
      }
      location2.months[month] = {
        subscribers,
        joined: count(record?.joined, 0),
        left: count(record?.left, 0)
      };
      pool.companies[name] = locations;
    }
    const importedAt = nowIso2();
    const sourceName = cleanText(source.name) || "\uC9C1\uC811 \uC785\uB825 CSV";
    const months = [...new Set(records.map(({ month }) => normalizeMonth(month)))].filter(Boolean).sort().reverse();
    const sourceRecord = {
      name: sourceName,
      importedAt,
      recordCount: records.length,
      months,
      portalMonth: normalizePensionMonth(source.portalMonth) ?? getPensionSourceMonth(sourceName),
      sourceUrl: cleanText(source.sourceUrl) || null
    };
    pool.sources = [
      ...pool.sources.filter(
        (item) => !(item.name === sourceRecord.name && JSON.stringify(item.months) === JSON.stringify(sourceRecord.months))
      ),
      sourceRecord
    ];
    pool.updatedAt = importedAt;
    return pool;
  }
  function mergePensionRecordBatchesIntoNormalizedPool(pool, batches) {
    for (const batch of batches ?? []) {
      applyPensionRecords(pool, batch.records ?? [], batch.source ?? {});
    }
    return sortPool(pool);
  }
  function filterPensionPoolByCurrentSubscribers(poolValue, minimumCurrentSubscribers = OFFICIAL_PENSION_MIN_CURRENT_SUBSCRIBERS) {
    const pool = normalizePensionPool(poolValue);
    const minimum = Math.max(0, Number(minimumCurrentSubscribers) || 0);
    const protectedNames = new Set(pool.protectedCompanies);
    const companies = {};
    for (const [name, locations] of Object.entries(pool.companies)) {
      const keptLocations = protectedNames.has(name) ? locations : locations.filter((location2) => {
        const latestMonth = Object.keys(location2.months)[0];
        const subscribers = location2.months[latestMonth]?.subscribers;
        return Number.isFinite(subscribers) && subscribers > minimum;
      });
      if (keptLocations.length > 0) companies[name] = keptLocations;
    }
    return sortPool({ ...pool, companies });
  }
  function summarizePensionPool(poolValue) {
    const pool = normalizePensionPool(poolValue);
    return summarizeNormalizedPensionPool(pool);
  }
  function summarizeNormalizedPensionPool(pool) {
    let locationCount = 0;
    let snapshotCount = 0;
    const months = /* @__PURE__ */ new Set();
    for (const locations of Object.values(pool.companies)) {
      locationCount += locations.length;
      for (const location2 of locations) {
        const locationMonths = Object.keys(location2.months);
        snapshotCount += locationMonths.length;
        for (const month of locationMonths) months.add(month);
      }
    }
    const orderedMonths = [...months].sort().reverse();
    const installedSourceMonths = [
      ...new Set(pool.sources.map(getPensionSourceMonth).filter(Boolean))
    ].sort().reverse();
    return {
      companyCount: Object.keys(pool.companies).length,
      locationCount,
      snapshotCount,
      months: orderedMonths,
      installedSourceMonths,
      latestInstalledSourceMonth: getLatestPensionMonth(installedSourceMonths),
      latestMonth: orderedMonths[0] ?? null,
      oldestMonth: orderedMonths.at(-1) ?? null,
      updatedAt: pool.updatedAt
    };
  }

  // src/pension-pool-storage.js
  var PENSION_POOL_STORAGE_KEY = "hayoung:pension-pool";
  var PENSION_POOL_SUMMARY_KEY = "hayoung:pension-pool-summary";
  var pensionMutationQueue = Promise.resolve();
  function queuePensionMutation(operation) {
    const current = pensionMutationQueue.catch(() => {
    }).then(operation);
    pensionMutationQueue = current.catch(() => {
    });
    return current;
  }
  async function loadPensionPool() {
    return normalizePensionPool(await get(PENSION_POOL_STORAGE_KEY));
  }
  async function loadPensionPoolSummary() {
    const stored = await get(PENSION_POOL_SUMMARY_KEY);
    if (stored && Array.isArray(stored.installedSourceMonths)) return stored;
    const summary = summarizePensionPool(await loadPensionPool());
    await set(PENSION_POOL_SUMMARY_KEY, summary);
    return summary;
  }
  async function writeNormalizedPensionPool(pool) {
    const summary = summarizeNormalizedPensionPool(pool);
    await Promise.all([
      set(PENSION_POOL_STORAGE_KEY, pool),
      set(PENSION_POOL_SUMMARY_KEY, summary)
    ]);
    return { pool, summary };
  }
  async function savePensionPool(poolValue) {
    return writeNormalizedPensionPool(normalizePensionPool(poolValue));
  }
  function importPensionCsvFiles(files, options = {}) {
    return queuePensionMutation(async () => {
      const pool = await loadPensionPool();
      const diagnostics = [];
      const batches = [];
      for (const file of files) {
        const text = typeof file.arrayBuffer === "function" ? decodeCsvBytes(await file.arrayBuffer()) : typeof file.text === "function" ? await file.text() : file.text;
        const parsed = parsePensionCsv(text);
        batches.push({
          records: parsed.records,
          source: {
            name: file.name,
            sourceUrl: file.sourceUrl,
            portalMonth: file.pensionSourceMonth
          }
        });
        diagnostics.push({ name: file.name, ...parsed.diagnostics });
      }
      assertRequiredPensionMonth(
        summarizeNormalizedPensionPool(pool),
        files.map(
          (file) => file.pensionSourceMonth ?? getPensionSourceMonth(file.name)
        ),
        options.requiredLatestMonth
      );
      const merged = mergePensionRecordBatchesIntoNormalizedPool(pool, batches);
      const filtered = filterPensionPoolByCurrentSubscribers(merged);
      const excludedLocationCount = summarizeNormalizedPensionPool(merged).locationCount - summarizeNormalizedPensionPool(filtered).locationCount;
      return {
        ...await writeNormalizedPensionPool(filtered),
        diagnostics,
        excludedLocationCount
      };
    });
  }
  function deletePensionPoolMonth2(month) {
    return queuePensionMutation(
      async () => savePensionPool(deletePensionPoolMonth(await loadPensionPool(), month))
    );
  }

  // src/pension-binding.js
  var MINIMUM_PENSION_BIND_NAME_SCORE = 90;
  var MAXIMUM_PENSION_BIND_EMPLOYEE_DIFFERENCE = 300;
  function formatBindingSignal(value) {
    return Number.isFinite(value) ? `${value}%` : "\uD655\uC778 \uBD88\uAC00";
  }
  function createPensionBindingConfirmationMessage(sourceName, result, addressWarning = false) {
    const lines = [
      "\uAD6D\uBBFC\uC5F0\uAE08 \uC0AC\uC5C5\uC7A5\uC744 \uC218\uB3D9 \uBC14\uC778\uB4DC\uD569\uB2C8\uB2E4.",
      "",
      `\uAC80\uC0C9 \uD68C\uC0AC: ${String(sourceName ?? "").trim() || "\uD655\uC778 \uBD88\uAC00"}`,
      `\uC5F0\uAE08 \uC0AC\uC5C5\uC7A5: ${String(result?.name ?? "").trim() || "\uD655\uC778 \uBD88\uAC00"}`,
      `\uC8FC\uC18C: ${String(result?.matchedAddress ?? "").trim() || "\uD655\uC778 \uBD88\uAC00"}`,
      `\uC774\uB984 \uC77C\uCE58\uC728: ${formatBindingSignal(result?.signals?.name)}`,
      `\uC8FC\uC18C \uC77C\uCE58\uC728: ${formatBindingSignal(result?.signals?.address)}`
    ];
    if (Number.isFinite(result?.latest?.subscribers)) {
      lines.push(`\uCD5C\uC2E0 \uAC00\uC785\uC790 \uC218: ${result.latest.subscribers}\uBA85`);
    }
    lines.push("", "\uC774 \uC5F0\uACB0\uC740 \uC774\uD6C4 \uC5F0\uAE08 \uBE44\uAD50\uC5D0\uC11C \uAC00\uC7A5 \uBA3C\uC800 \uC801\uC6A9\uB429\uB2C8\uB2E4.");
    if (addressWarning) {
      lines.push(
        "\uC8FC\uC18C \uC77C\uCE58\uC728\uC774 30% \uBBF8\uB9CC\uC774\uAC70\uB098 \uD655\uC778 \uBD88\uAC00\uC785\uB2C8\uB2E4. \uBC14\uC778\uB4DC\uD558\uBA74 \uD68C\uC0AC\uAC00 \uBD89\uC740 \uD1A4\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4."
      );
    }
    lines.push("", "\uACC4\uC18D\uD560\uAE4C\uC694?");
    return lines.join("\n");
  }
  function getPensionBindingRestriction(result, officialEmployeeCount, searchedCompanyName = "") {
    const nameScore = result?.signals?.name;
    if (!Number.isFinite(nameScore) || nameScore < MINIMUM_PENSION_BIND_NAME_SCORE) {
      return `\uC774\uB984 \uC77C\uCE58\uC728 ${MINIMUM_PENSION_BIND_NAME_SCORE}% \uC774\uC0C1\uB9CC \uBC14\uC778\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
    }
    const searchedName = normalizeCompanyName(searchedCompanyName);
    const resultName = normalizeCompanyName(result?.name);
    if (searchedName && resultName && resultName.length < searchedName.length) {
      return "\uBC95\uC778 \uD45C\uAE30\uB97C \uC81C\uC678\uD55C \uACB0\uACFC \uD68C\uC0AC\uBA85\uC774 \uAC80\uC0C9\uD55C \uD68C\uC0AC\uBA85\uBCF4\uB2E4 \uC9E7\uC544 \uBC14\uC778\uB4DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
    }
    const subscribers = result?.latest?.subscribers;
    if (Number.isFinite(officialEmployeeCount) && Number.isFinite(subscribers) && Math.abs(officialEmployeeCount - subscribers) >= MAXIMUM_PENSION_BIND_EMPLOYEE_DIFFERENCE) {
      return `\uCC44\uC6A9 \uC0AC\uC774\uD2B8 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218\uC640 \uC5F0\uAE08 \uAC00\uC785\uC790 \uC218 \uCC28\uC774\uAC00 ${MAXIMUM_PENSION_BIND_EMPLOYEE_DIFFERENCE}\uBA85 \uC774\uC0C1\uC774\uB77C \uBC14\uC778\uB4DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`;
    }
    return null;
  }

  // src/feature-flags.js
  var INTERNAL_FEATURE_FLAGS = Object.freeze({
    // Bundled GameJob mappings are curated ahead of release and may bind without
    // the manual confirmation dialog. User-selected binds remain confirm-only.
    automaticPensionBinding: true
  });

  // src/pension-data-portal.js
  var PENSION_PORTAL_ORIGIN = "https://www.data.go.kr";
  var PENSION_PORTAL_DATASET_ID = "15083277";
  var PENSION_PORTAL_EARLIEST_YEAR = 2015;
  var PENSION_PORTAL_DATASET_URL = `${PENSION_PORTAL_ORIGIN}/data/${PENSION_PORTAL_DATASET_ID}/fileData.do`;
  function getPensionPortalFileMonth(nameValue) {
    const name = cleanText(nameValue);
    const compact = name.match(/(20\d{2})(0[1-9]|1[0-2])(?:[0-3]\d)?/);
    if (compact) return `${compact[1]}-${compact[2]}`;
    const korean = name.match(/(20\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월/);
    if (korean) return `${korean[1]}-${korean[2].padStart(2, "0")}`;
    const slash = name.match(/(0?[1-9]|1[0-2])\/(?:[0-3]?\d)\/(20\d{2})/);
    return slash ? `${slash[2]}-${slash[1].padStart(2, "0")}` : null;
  }

  // src/extension-assets.js
  function getExtensionAssetPrefix(manifest = globalThis.chrome?.runtime?.getManifest?.()) {
    const worker = manifest?.background?.service_worker;
    return typeof worker === "string" && worker.startsWith("dist/") ? "dist/" : "";
  }
  function getExtensionAssetPath(path, manifest) {
    const normalizedPath = String(path ?? "").replace(/^\/+/, "");
    return `${getExtensionAssetPrefix(manifest)}${normalizedPath}`;
  }

  // src/ui/dom.js
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== void 0 && text !== null) element.textContent = text;
    return element;
  }
  function makeButton(label, className, onClick, title = "") {
    const button = make("button", `hy-button ${className ?? ""}`.trim(), label);
    button.type = "button";
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
  }
  function appendKeyValue(container, label, value, valueClass = "") {
    const item = make("div", "hy-kv");
    item.append(
      make("span", "hy-kv-label", label),
      make("strong", `hy-kv-value ${valueClass}`.trim(), value)
    );
    container.append(item);
  }

  // src/ui/panel-resize.js
  var PANEL_RESIZE_DIRECTIONS = Object.freeze([
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
    "nw"
  ]);
  function clamp2(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }
  function calculatePanelResize({
    direction,
    startRect,
    deltaX,
    deltaY,
    viewportWidth,
    viewportHeight,
    minWidth,
    minHeight
  }) {
    const resizeWest = direction.includes("w");
    const resizeEast = direction.includes("e");
    const resizeNorth = direction.includes("n");
    const resizeSouth = direction.includes("s");
    const effectiveMinWidth = Math.min(minWidth, viewportWidth);
    const effectiveMinHeight = Math.min(minHeight, viewportHeight);
    let left = startRect.left;
    let right = startRect.right;
    let top = startRect.top;
    let bottom = startRect.bottom;
    if (resizeWest) {
      left = clamp2(
        startRect.left + deltaX,
        0,
        startRect.right - effectiveMinWidth
      );
    } else if (resizeEast) {
      right = clamp2(
        startRect.right + deltaX,
        startRect.left + effectiveMinWidth,
        viewportWidth
      );
    }
    if (resizeNorth) {
      top = clamp2(
        startRect.top + deltaY,
        0,
        startRect.bottom - effectiveMinHeight
      );
    } else if (resizeSouth) {
      bottom = clamp2(
        startRect.bottom + deltaY,
        startRect.top + effectiveMinHeight,
        viewportHeight
      );
    }
    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top)
    };
  }

  // src/pension-copy.js
  var PENSION_ACQUISITION_LABEL = "\uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218";
  var PENSION_ACQUISITION_WARNING = "\uC2E0\uADDC\uCDE8\uB4DD\uC790\uC218\uC5D0\uB294 \uB0A9\uBD80\uC7AC\uAC1C\uAC00 \uD3EC\uD568\uB418\uACE0 \uC2E0\uACE0\uC2DC\uC810 \uCC28\uC774\uAC00 \uC788\uC5B4 \uC2E4\uC81C \uC785\uC0AC\uC790 \uC218\uC640 \uB2E4\uB97C \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
  var PENSION_LOSS_LABEL = "\uC0C1\uC2E4\uAC00\uC785\uC790\uC218";
  var PENSION_LOSS_WARNING = "\uC0C1\uC2E4\uAC00\uC785\uC790\uC218\uC5D0\uB294 \uB0A9\uBD80\uC608\uC678\uAC00 \uD3EC\uD568\uB418\uBBC0\uB85C \uC2E4\uC81C \uD1F4\uC0AC\uC790 \uC218\uC640 \uB2E4\uB97C \uC218 \uC788\uC2B5\uB2C8\uB2E4.";

  // src/ui/section-shell.js
  var SECTION_HELP = Object.freeze({
    companyInfo: "\uCC44\uC6A9 \uC0AC\uC774\uD2B8\uC758 \uAE30\uC5C5 \uC0C1\uC138\uC815\uBCF4\uC640 \uCD5C\uADFC \uCC44\uC6A9 \uD604\uD669\uC744 \uBD88\uB7EC\uC635\uB2C8\uB2E4.",
    postingDetails: "\uACF5\uACE0 \uC54C\uB9BC\uACFC \uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218, \uAD6D\uBBFC\uC5F0\uAE08 \uAC00\uC785\uC790, \uC0C1\uC138 \uACF5\uACE0 \uAE30\uB85D\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4.",
    pastPostings: "\uC11C\uBC84 \uBD80\uB2F4\uC744 \uC904\uC774\uAE30 \uC704\uD574 \uACF5\uACE0\uB97C \uD55C \uBC88\uC5D0 \uD55C \uD398\uC774\uC9C0\uB9CC \uD638\uCD9C\uD569\uB2C8\uB2E4.",
    workforce: [
      "\uD68C\uC0AC\uBA85\uC73C\uB85C \uAD6D\uBBFC\uC5F0\uAE08 \uC0AC\uC5C5\uC7A5 \uD6C4\uBCF4\uB97C \uAC80\uC0C9\uD558\uACE0 \uC6D4\uBCC4 \uAC00\uC785\uC790 \uBCC0\uD654\uB97C \uBE44\uAD50\uD569\uB2C8\uB2E4.",
      { text: PENSION_ACQUISITION_WARNING, warning: true },
      { text: PENSION_LOSS_WARNING, warning: true }
    ],
    pensionData: [
      "\uAD6D\uBBFC\uC5F0\uAE08 \uC7A5\uAE30\uAC00\uC785\uC790 \uC218",
      { text: "\uC9C1\uC6D0 \uC218\uAC00 \uC544\uB2D9\uB2C8\uB2E4", warning: true },
      { text: PENSION_ACQUISITION_WARNING, warning: true },
      { text: PENSION_LOSS_WARNING, warning: true },
      { text: "\uAC00\uC785\uC790 \uC218 10\uBA85 \uC774\uD558\uB294 \uD45C\uC2DC\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4", warning: true },
      "\uB0B4\uC7A5 \uAC8C\uC784\uC5C5\uC885 \uAE30\uBCF8 \uBAA9\uB85D\uC740 \uC608\uC678\uC785\uB2C8\uB2E4"
    ],
    enhancedSearch: "\uAC8C\uC784\uC7A1 \uACF5\uACE0 \uBAA9\uB85D\uC758 \uC228\uAE30\uAE30\xB7\uC608\uC678\xB7\uC9D1\uC911 \uAC80\uC0C9 \uC870\uAC74\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4."
  });
  function helpAriaLabel(content) {
    const lines = Array.isArray(content) ? content : [content];
    return lines.map((line) => typeof line === "string" ? line : line?.text).filter(Boolean).join(". ");
  }
  function createHelpMark(content, className = "", symbol = "?") {
    if (!content) return null;
    const help = make("span", `hy-help-mark ${className}`.trim());
    help.tabIndex = 0;
    help.setAttribute("role", "note");
    help.setAttribute("aria-label", helpAriaLabel(content));
    const tooltip = make("span", "hy-help-tooltip");
    for (const line of Array.isArray(content) ? content : [content]) {
      const text = typeof line === "string" ? line : line?.text;
      if (!text) continue;
      tooltip.append(
        make(
          line?.warning ? "strong" : "span",
          line?.warning ? "hy-help-warning" : "",
          text
        )
      );
    }
    help.append(make("span", "hy-help-symbol", symbol), tooltip);
    help.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return help;
  }
  function createSectionActionButton(label, { active = false, disabled = false, title = "", onClick } = {}) {
    const button = makeButton(
      label,
      "hy-section-action",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      },
      title
    );
    button.draggable = false;
    button.disabled = disabled;
    button.classList.toggle("hy-active", active);
    button.setAttribute("aria-pressed", String(active));
    return button;
  }
  function createSectionSpinner(label = "\uBD88\uB7EC\uC624\uB294 \uC911") {
    const spinner = make("span", "hy-section-spinner");
    spinner.title = label;
    spinner.setAttribute("role", "status");
    spinner.setAttribute("aria-label", label);
    return spinner;
  }
  function createSection(title, key, settings, actions2, { helpContent = SECTION_HELP[key] } = {}) {
    const details = make("details", "hy-section");
    details.dataset.section = key;
    details.open = settings.sections?.[key] ?? true;
    const summary = make("summary", "hy-section-title");
    summary.draggable = true;
    summary.title = "\uB9C8\uC6B0\uC2A4\uB85C \uB04C\uC5B4 \uC139\uC158 \uC21C\uC11C \uBCC0\uACBD";
    const heading = make("span", "hy-section-heading");
    heading.append(make("span", "hy-section-label", title));
    const help = createHelpMark(helpContent);
    if (help) heading.append(help);
    const headerActions = make("span", "hy-section-actions");
    summary.append(
      heading,
      headerActions,
      make("span", "hy-section-drag-handle", "\u283F"),
      make("span", "hy-section-toggle-icon")
    );
    const content = make("div", "hy-section-content");
    details.append(summary, content);
    details.addEventListener("toggle", () => {
      actions2.onSettingsChange({ sections: { [key]: details.open } }, false);
    });
    return { details, content, headerActions, heading };
  }

  // src/ui/options-window.js
  function optionToggle(settings, key, title, description, actions2) {
    const label = make("label", "hy-option-row");
    label.dataset.tooltip = description;
    const copy = make("span", "hy-option-copy");
    copy.append(make("strong", "", title));
    const input = make("input", "hy-option-switch");
    input.type = "checkbox";
    input.setAttribute("aria-label", `${title}: ${description}`);
    input.checked = Boolean(settings[key]);
    input.addEventListener(
      "change",
      () => actions2.onSettingsChange({ [key]: input.checked })
    );
    label.append(copy, input);
    return label;
  }
  function visibilityToggle(settings, key, title, actions2) {
    const label = make("label", "hy-window-option-row");
    const input = make("input");
    input.type = "checkbox";
    input.checked = settings.sectionVisibility?.[key] ?? true;
    input.addEventListener(
      "change",
      () => actions2.onSettingsChange({
        sectionVisibility: { [key]: input.checked }
      })
    );
    label.append(input, make("span", "", title));
    return label;
  }
  function getVisibleSectionChoices(viewModel) {
    return [
      ...viewModel.site?.id === "jobkorea" ? [["companyInfo", "\uCC44\uC6A9 \uD68C\uC0AC \uC815\uBCF4"]] : [],
      ...viewModel.site?.id === "gamejob" && viewModel.company ? [["postingDetails", "\uC77C\uBC18"]] : [],
      ...viewModel.gamejobListMode ? [["enhancedSearch", "\uAC80\uC0C9 \uAC15\uD654"]] : [],
      [
        "pastPostings",
        viewModel.site?.id === "gamejob" ? "\uACF5\uACE0 \uC0C1\uC138" : "\uACF5\uACE0 \uD638\uCD9C"
      ],
      ["workforce", "\uC5F0\uAE08 \uBE44\uAD50"],
      ["pensionData", "\uC5F0\uAE08 \uB370\uC774\uD130"]
    ];
  }
  function renderWindowOptions(viewModel, actions2) {
    const wrapper = make("div", "hy-window-options");
    wrapper.append(
      make("h3", "hy-option-subtitle", "\uC708\uB3C4\uC6B0"),
      make(
        "p",
        "hy-option-description",
        "\uB370\uC774\uD130\uB294 \uC720\uC9C0\uD558\uACE0 \uD50C\uB85C\uD305 \uCC3D\uC5D0 \uBCF4\uC774\uB294 \uC139\uC158\uB9CC \uCF1C\uAC70\uB098 \uB055\uB2C8\uB2E4."
      )
    );
    const list = make("div", "hy-window-option-list");
    for (const [key, title] of getVisibleSectionChoices(viewModel)) {
      list.append(visibilityToggle(viewModel.settings, key, title, actions2));
    }
    wrapper.append(list);
    return wrapper;
  }
  function createPreferenceChoices({ choices, selected, className, onSelect }) {
    const list = make("div", className);
    for (const choice of choices) {
      const button = makeButton(
        choice.label,
        "hy-preference-choice",
        () => onSelect(choice.value),
        choice.description
      );
      const active = selected === choice.value;
      button.classList.toggle("hy-active", active);
      button.setAttribute("aria-pressed", String(active));
      list.append(button);
    }
    return list;
  }
  function renderAppearanceOptions(settings, actions2) {
    const wrapper = make("div", "hy-appearance-options");
    wrapper.append(make("h3", "hy-option-subtitle", "\uD14C\uB9C8"));
    wrapper.append(
      createPreferenceChoices({
        choices: PANEL_THEMES,
        selected: normalizePanelTheme(settings.theme),
        className: "hy-theme-choice-list",
        onSelect: (theme) => actions2.onSettingsChange({ theme })
      })
    );
    return wrapper;
  }
  function renderDataManagement(viewModel, actions2) {
    const wrapper = make("div", "hy-option-data-management");
    wrapper.append(make("h3", "hy-option-subtitle", "\uB370\uC774\uD130 \uAD00\uB9AC"));
    wrapper.append(
      makeButton("Hayoung4 \uC804\uCCB4 \uCD08\uAE30\uD654", "hy-attention", () => {
        if (confirm("\uBAA8\uB4E0 \uD68C\uC0AC \uAE30\uB85D, \uC778\uB825 \uB370\uC774\uD130, \uC124\uC815\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?")) {
          actions2.onClearAll();
        }
      }),
      make("p", "hy-version", `\uB370\uC774\uD130 v${viewModel.schemaVersion}`)
    );
    return wrapper;
  }
  function createOptionsWindow(viewModel, actions2) {
    const window2 = make("section", "hy-options-window");
    const header = make("div", "hy-options-window-header");
    header.append(
      make("strong", "", "\uC635\uC158"),
      makeButton("\xD7", "hy-icon-button", actions2.onToggleOptions, "\uC635\uC158 \uB2EB\uAE30")
    );
    const content = make("div", "hy-options-window-content");
    content.append(
      renderWindowOptions(viewModel, actions2),
      renderAppearanceOptions(viewModel.settings, actions2)
    );
    if (viewModel.site?.id === "jobkorea") {
      content.append(
        optionToggle(
          viewModel.settings,
          "autoCompanyInfo",
          "\uC790\uB3D9 \uD68C\uC0AC\uC815\uBCF4",
          "\uACF5\uACE0\uB97C \uC5F4 \uB54C 1.0~1.5\uCD08 \uAE30\uB2E4\uB9B0 \uB4A4 \uD68C\uC0AC\uC815\uBCF4\uB97C \uD55C \uBC88 \uAC00\uC838\uC635\uB2C8\uB2E4.",
          actions2
        )
      );
    }
    const pastPostingPageSize = viewModel.site?.id === "gamejob" ? 10 : 30;
    content.append(
      optionToggle(
        viewModel.settings,
        "autoPastPostings",
        "\uC790\uB3D9 \uACFC\uAC70 \uACF5\uACE0",
        `\uACF5\uACE0\uB97C \uC5F4 \uB54C \uCCAB \uD398\uC774\uC9C0(\uCD5C\uB300 ${pastPostingPageSize}\uAC1C)\uB9CC \uD55C \uBC88 \uAC00\uC838\uC635\uB2C8\uB2E4.`,
        actions2
      ),
      optionToggle(
        viewModel.settings,
        "scrollLoadPostings",
        "\uC2A4\uD06C\uB864 \uCD94\uAC00 \uACF5\uACE0",
        "\uACF5\uACE0 \uBAA9\uB85D \uB05D\uC5D0\uC11C \uD55C \uBC88 \uB354 \uC544\uB798\uB85C \uC2A4\uD06C\uB864\uD558\uBA74 \uB2E4\uC74C 1\uD398\uC774\uC9C0\uB97C \uAC00\uC838\uC635\uB2C8\uB2E4.",
        actions2
      ),
      optionToggle(
        viewModel.settings,
        "positionLocked",
        "\uD50C\uB85C\uD305 \uCC3D \uC704\uCE58 \uC7A0\uAE08",
        "\uCF1C\uBA74 \uD5E4\uB354\uC640 \uC811\uD78C HY \uBC84\uD2BC\uC744 \uB4DC\uB798\uADF8\uD574\uB3C4 \uCC3D \uC704\uCE58\uAC00 \uC6C0\uC9C1\uC774\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        actions2
      ),
      optionToggle(
        viewModel.settings,
        "simpleMode",
        "\uAC04\uD3B8 \uBAA8\uB4DC",
        "\uD575\uC2EC \uD68C\uC0AC\xB7\uACF5\uACE0 \uC815\uBCF4\uB97C \uD070 \uCE74\uB4DC \uC911\uC2EC\uC73C\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4.",
        actions2
      )
    );
    const fontLabel = make("label", "hy-range");
    fontLabel.append(make("span", "", "\uAE00\uC790 \uD06C\uAE30"));
    const font = make("input");
    font.type = "range";
    font.min = "0.85";
    font.max = "1.25";
    font.step = "0.05";
    font.value = String(viewModel.settings.fontScale ?? 1);
    font.addEventListener(
      "change",
      () => actions2.onSettingsChange({ fontScale: Number(font.value) })
    );
    fontLabel.append(font);
    content.append(fontLabel, renderDataManagement(viewModel, actions2));
    window2.append(header, content);
    return window2;
  }

  // src/ui/enhanced-search.js
  var RULE_ITEM_SELECTOR = ".hy-enhanced-rule-item";
  function formatHiddenAt(value) {
    if (!value) return "\uC228\uAE34 \uC2DC\uAC01 \uBBF8\uAE30\uB85D";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "\uC228\uAE34 \uC2DC\uAC01 \uBBF8\uAE30\uB85D";
    return "\uC228\uAE40 " + date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function createRuleItem(title, meta, key, onRemove) {
    const item = make("article", "hy-enhanced-list-item hy-enhanced-rule-item");
    item.draggable = true;
    item.dataset.ruleKey = key;
    const handle = make("span", "hy-enhanced-drag-handle", "\u283F");
    handle.title = "\uB9C8\uC6B0\uC2A4\uB85C \uB04C\uC5B4 \uC21C\uC11C \uBCC0\uACBD";
    const copy = make("div", "hy-enhanced-list-copy");
    copy.append(make("strong", "", title));
    if (meta) copy.append(make("small", "", meta));
    item.append(
      handle,
      copy,
      makeButton("\uC228\uAE30\uAE30 \uD574\uC81C", "hy-text-button", onRemove)
    );
    return item;
  }
  function createRuleTag(rule, key, onRemove, onToggle) {
    const item = make("span", "hy-enhanced-tag hy-enhanced-rule-item");
    item.draggable = true;
    item.dataset.ruleKey = key;
    item.classList.toggle("hy-disabled", !rule.enabled);
    const label = make("span", "hy-enhanced-tag-label", rule.value);
    label.title = "\uB9C8\uC6B0\uC2A4\uB85C \uB04C\uC5B4 \uC21C\uC11C \uBCC0\uACBD";
    const switchLabel = make("label", "hy-enhanced-tag-switch");
    const checkbox = make("input");
    checkbox.type = "checkbox";
    checkbox.checked = rule.enabled;
    checkbox.setAttribute("aria-label", `${rule.value} \uC0AC\uC6A9 \uC5EC\uBD80`);
    checkbox.addEventListener(
      "change",
      () => onToggle(rule.value, checkbox.checked)
    );
    switchLabel.append(
      checkbox,
      make("span", "hy-enhanced-tag-state", rule.enabled ? "ON" : "OFF")
    );
    const remove2 = makeButton("\xD7", "hy-enhanced-tag-remove", onRemove, "\uC0AD\uC81C");
    item.append(label, switchLabel, remove2);
    return item;
  }
  function installListReorder(list, kind, actions2) {
    let dragged = null;
    list.addEventListener("dragstart", (event) => {
      if (event.target.closest("button, input, label")) {
        event.preventDefault();
        return;
      }
      const item = event.target.closest(RULE_ITEM_SELECTOR);
      if (!item) return;
      dragged = item;
      item.classList.add("hy-enhanced-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.dataset.ruleKey);
    });
    list.addEventListener("dragover", (event) => {
      if (!dragged) return;
      const target = event.target.closest(RULE_ITEM_SELECTOR);
      if (!target || target === dragged) return;
      event.preventDefault();
      const bounds = target.getBoundingClientRect();
      list.insertBefore(
        dragged,
        event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling
      );
    });
    const finish = () => {
      if (!dragged) return;
      dragged.classList.remove("hy-enhanced-dragging");
      dragged = null;
      actions2.onReorderGamejobSearchItems(
        kind,
        [...list.querySelectorAll(`:scope > ${RULE_ITEM_SELECTOR}`)].map(
          (item) => item.dataset.ruleKey
        )
      );
    };
    list.addEventListener("drop", (event) => {
      if (!dragged) return;
      event.preventDefault();
      finish();
    });
    list.addEventListener("dragend", finish);
  }
  function createRuleList(items, options, actions2) {
    const list = make(
      "div",
      options.compact ? "hy-enhanced-list hy-enhanced-tag-list" : "hy-enhanced-list"
    );
    if (items.length === 0) {
      list.append(make("span", "hy-enhanced-empty", "\uC228\uAE34 \uD56D\uBAA9 \uC5C6\uC74C"));
      return list;
    }
    for (const item of items) list.append(options.createItem(item));
    installListReorder(list, options.kind, actions2);
    return list;
  }
  function createPhraseInput({ placeholder, buttonLabel, onAdd }) {
    const inputRow = make("div", "hy-enhanced-input-row");
    const input = make("input", "hy-enhanced-input");
    input.type = "text";
    input.placeholder = placeholder;
    const add = () => {
      const value = input.value.trim();
      if (!value) return;
      onAdd(value);
      input.value = "";
    };
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      add();
    });
    inputRow.append(input, makeButton(buttonLabel, "hy-secondary", add));
    return inputRow;
  }
  function createModeToggle(settings, actions2) {
    const label = make("label", "hy-enhanced-mode-row");
    const copy = make("span", "hy-enhanced-mode-copy");
    copy.append(
      make("strong", "", "\uC9D1\uC911 \uAC80\uC0C9 \uBAA8\uB4DC"),
      make("small", "", "\uAC80\uC0C9 \uBB38\uAD6C\uAC00 \uC788\uC73C\uBA74 \uC77C\uCE58\uD558\uC9C0 \uC54A\uB294 \uACF5\uACE0\uB97C \uBAA8\uB450 \uC228\uAE41\uB2C8\uB2E4.")
    );
    const input = make("input");
    input.type = "checkbox";
    input.checked = Boolean(settings.gamejobFocusMode);
    input.addEventListener(
      "change",
      () => actions2.onSettingsChange({ gamejobFocusMode: input.checked })
    );
    label.append(copy, input);
    return label;
  }
  function createPriorityToggle(settings, actions2) {
    const label = make("label", "hy-enhanced-priority-row");
    const input = make("input");
    input.type = "checkbox";
    input.checked = Boolean(settings.gamejobFocusPriority);
    input.addEventListener(
      "change",
      () => actions2.onSettingsChange({ gamejobFocusPriority: input.checked })
    );
    label.append(input, make("span", "", "\uC77C\uCE58 \uACF5\uACE0 \uC6B0\uC120 \uC815\uB82C"));
    return label;
  }
  function createIgnoreHiddenCompaniesToggle(settings, actions2) {
    const label = make("label", "hy-enhanced-priority-row");
    const input = make("input");
    input.type = "checkbox";
    input.checked = Boolean(settings.gamejobFocusIgnoreHiddenCompanies);
    input.addEventListener(
      "change",
      () => actions2.onSettingsChange({
        gamejobFocusIgnoreHiddenCompanies: input.checked
      })
    );
    label.append(input, make("span", "", "\uC228\uAE34 \uD68C\uC0AC\uB3C4 \uD45C\uC2DC"));
    label.title = "\uC9D1\uC911 \uAC80\uC0C9 \uC911\uC5D0\uB294 \uD68C\uC0AC \uC228\uAE30\uAE30\uC640 \uAD00\uACC4\uC5C6\uC774 \uAC80\uC0C9 \uBB38\uAD6C\uC5D0 \uB9DE\uB294 \uACF5\uACE0\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4.";
    return label;
  }
  function createEnhancedGroup({
    key,
    title,
    count: count2,
    description,
    settings,
    actions: actions2,
    content
  }) {
    const details = make("details", "hy-enhanced-group");
    details.dataset.enhancedGroup = key;
    details.open = settings.enhancedSearchGroups?.[key] ?? true;
    const summary = make("summary", "hy-enhanced-group-title");
    summary.draggable = true;
    summary.title = "\uB9C8\uC6B0\uC2A4\uB85C \uB04C\uC5B4 \uADF8\uB8F9 \uC21C\uC11C \uBCC0\uACBD";
    summary.append(
      make("span", "hy-enhanced-drag-handle", "\u283F"),
      make("span", "", title),
      make("span", "hy-enhanced-group-count", String(count2))
    );
    details.append(
      summary,
      make("p", "hy-enhanced-description", description),
      content
    );
    details.addEventListener("toggle", () => {
      actions2.onSettingsChange(
        { enhancedSearchGroups: { [key]: details.open } },
        false
      );
    });
    return details;
  }
  function installGroupReorder(container, settings, actions2) {
    let dragged = null;
    container.addEventListener("dragstart", (event) => {
      const summary = event.target.closest(".hy-enhanced-group-title");
      if (!summary) return;
      dragged = summary.closest(".hy-enhanced-group");
      dragged.classList.add("hy-enhanced-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragged.dataset.enhancedGroup);
    });
    container.addEventListener("dragover", (event) => {
      if (!dragged) return;
      const target = event.target.closest(".hy-enhanced-group");
      if (!target || target === dragged) return;
      event.preventDefault();
      const bounds = target.getBoundingClientRect();
      container.insertBefore(
        dragged,
        event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling
      );
    });
    const finish = () => {
      if (!dragged) return;
      dragged.classList.remove("hy-enhanced-dragging");
      dragged = null;
      const visibleOrder = [
        ...container.querySelectorAll(":scope > .hy-enhanced-group")
      ].map((group) => group.dataset.enhancedGroup);
      const visible = new Set(visibleOrder);
      const saved = settings.enhancedSearchOrder ?? [];
      const nextOrder = [];
      let inserted = false;
      for (const key of saved) {
        if (visible.has(key)) {
          if (!inserted) nextOrder.push(...visibleOrder);
          inserted = true;
        } else {
          nextOrder.push(key);
        }
      }
      if (!inserted) nextOrder.push(...visibleOrder);
      actions2.onSettingsChange(
        { enhancedSearchOrder: [...new Set(nextOrder)] },
        false
      );
    };
    container.addEventListener("drop", (event) => {
      if (!dragged) return;
      event.preventDefault();
      finish();
    });
    container.addEventListener("dragend", finish);
  }
  function phraseContent(items, kind, inputOptions, removeAction, toggleAction, actions2) {
    const content = make("div", "hy-enhanced-group-content");
    const rules = items.map(normalizeGamejobPhraseRule).filter(Boolean);
    content.append(
      createPhraseInput(inputOptions),
      createRuleList(
        rules,
        {
          kind,
          compact: true,
          createItem: (rule) => createRuleTag(
            rule,
            normalizeGamejobSearchPhrase(rule.value),
            () => removeAction(rule.value),
            toggleAction
          )
        },
        actions2
      )
    );
    return content;
  }
  function createPhraseGroup({
    key,
    title,
    description,
    items,
    inputOptions,
    removeAction,
    toggleAction,
    settings,
    actions: actions2
  }) {
    return createEnhancedGroup({
      key,
      title,
      count: items.length,
      description,
      settings,
      actions: actions2,
      content: phraseContent(
        items,
        key,
        inputOptions,
        removeAction,
        toggleAction,
        actions2
      )
    });
  }
  function createCompanyGroup(companies, settings, actions2) {
    return createEnhancedGroup({
      key: "companies",
      title: "\uD68C\uC0AC \uC228\uAE30\uAE30",
      count: companies.length,
      description: "\uACF5\uACE0 \uBAA9\uB85D\uC5D0\uC11C \uC9C1\uC811 \uC228\uAE34 \uD68C\uC0AC\uC785\uB2C8\uB2E4.",
      settings,
      actions: actions2,
      content: createRuleList(
        companies,
        {
          kind: "companies",
          createItem: (company) => {
            const key = getGamejobCompanyBlockKey(company);
            return createRuleItem(
              company.name || "\uD68C\uC0AC\uBA85 \uBBF8\uAE30\uB85D",
              null,
              key,
              () => actions2.onShowGamejobCompany(key)
            );
          }
        },
        actions2
      )
    });
  }
  function createPostingGroup(postings, settings, actions2) {
    return createEnhancedGroup({
      key: "postings",
      title: "\uACF5\uACE0 \uC228\uAE30\uAE30",
      count: postings.length,
      description: "\uACF5\uACE0 \uBAA9\uB85D\uC5D0\uC11C \uC9C1\uC811 \uC228\uAE34 \uACF5\uACE0\uC640 \uC228\uAE34 \uC2DC\uAC01\uC785\uB2C8\uB2E4.",
      settings,
      actions: actions2,
      content: createRuleList(
        postings,
        {
          kind: "postings",
          createItem: (posting) => createRuleItem(
            posting.title || "\uC81C\uBAA9 \uBBF8\uAE30\uB85D \uACF5\uACE0",
            formatHiddenAt(posting.blockedAt),
            String(posting.id),
            () => actions2.onShowGamejobPosting(posting.id)
          )
        },
        actions2
      )
    });
  }
  function createGamejobEnhancedSearchContent(viewModel, actions2) {
    const wrapper = make("div", "hy-enhanced-content");
    const settings = viewModel.settings;
    const groups = /* @__PURE__ */ new Map();
    const companies = settings.gamejobHiddenCompanies ?? [];
    groups.set("companies", createCompanyGroup(companies, settings, actions2));
    const phrases = settings.gamejobHidePhrases ?? [];
    groups.set(
      "hidePhrases",
      createPhraseGroup({
        key: "hidePhrases",
        title: "\uC228\uAE30\uAE30 \uBB38\uAD6C",
        description: "\uACF5\uACE0 \uC81C\uBAA9\uC5D0 \uBB38\uAD6C\uAC00 \uD3EC\uD568\uB418\uBA74 \uD574\uB2F9 \uACF5\uACE0\uB97C \uC228\uAE41\uB2C8\uB2E4.",
        items: phrases,
        inputOptions: {
          placeholder: "\uC228\uAE38 \uACF5\uACE0 \uC81C\uBAA9 \uBB38\uAD6C",
          buttonLabel: "\uBB38\uAD6C \uCD94\uAC00",
          onAdd: actions2.onAddGamejobHidePhrase
        },
        removeAction: actions2.onRemoveGamejobHidePhrase,
        toggleAction: actions2.onToggleGamejobHidePhrase,
        settings,
        actions: actions2
      })
    );
    const exceptions = settings.gamejobHideExceptions ?? [];
    groups.set(
      "hideExceptions",
      createPhraseGroup({
        key: "hideExceptions",
        title: "\uC228\uAE30\uAE30 \uD544\uD130 \uBB38\uAD6C",
        description: "\uC774 \uBB38\uAD6C\uAC00 \uC788\uC73C\uBA74 \uC77C\uBC18 \uC228\uAE30\uAE30 \uBB38\uAD6C\uC640 \uD568\uAED8 \uC788\uC5B4\uB3C4 \uD45C\uC2DC\uD569\uB2C8\uB2E4.",
        items: exceptions,
        inputOptions: {
          placeholder: "\uC228\uAE40\uC5D0\uC11C \uC81C\uC678\uD560 \uC81C\uBAA9 \uBB38\uAD6C",
          buttonLabel: "\uD544\uD130 \uCD94\uAC00",
          onAdd: actions2.onAddGamejobHideException
        },
        removeAction: actions2.onRemoveGamejobHideException,
        toggleAction: actions2.onToggleGamejobHideException,
        settings,
        actions: actions2
      })
    );
    const keywords = settings.gamejobFocusKeywords ?? [];
    const focusContent = phraseContent(
      keywords,
      "focusKeywords",
      {
        placeholder: "\uACF5\uACE0 \uC81C\uBAA9\uC5D0 \uD3EC\uD568\uB420 \uAC80\uC0C9 \uBB38\uAD6C",
        buttonLabel: "\uAC80\uC0C9\uC5B4 \uCD94\uAC00",
        onAdd: actions2.onAddGamejobFocusKeyword
      },
      actions2.onRemoveGamejobFocusKeyword,
      actions2.onToggleGamejobFocusKeyword,
      actions2
    );
    if (settings.gamejobFocusMode) {
      focusContent.prepend(
        createPriorityToggle(settings, actions2),
        createIgnoreHiddenCompaniesToggle(settings, actions2)
      );
    }
    groups.set(
      "focusKeywords",
      createEnhancedGroup({
        key: "focusKeywords",
        title: "\uACF5\uACE0 \uAC80\uC0C9 \uC990\uACA8\uCC3E\uAE30",
        count: keywords.length,
        description: "\uCF1C\uC9C4 \uAC80\uC0C9\uC5B4 \uC911 \uD55C \uAC1C \uC774\uC0C1 \uC77C\uCE58\uD558\uB294 \uACF5\uACE0\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uBAA8\uB450 \uAEBC\uC838 \uC788\uC73C\uBA74 \uBAA9\uB85D\uC744 \uADF8\uB300\uB85C \uB461\uB2C8\uB2E4.",
        settings,
        actions: actions2,
        content: focusContent
      })
    );
    const postings = settings.gamejobHiddenPostings ?? [];
    groups.set("postings", createPostingGroup(postings, settings, actions2));
    wrapper.append(createModeToggle(settings, actions2));
    const orderedKeys = [
      ...settings.enhancedSearchOrder ?? [],
      ...groups.keys()
    ];
    for (const key of new Set(orderedKeys)) {
      const group = groups.get(key);
      if (group) wrapper.append(group);
    }
    installGroupReorder(wrapper, settings, actions2);
    return wrapper;
  }

  // src/ui/past-postings.js
  function formatSavedTime(value) {
    if (!value) return "\u2014";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "\u2014" : date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function getPastPostingRows(viewModel, { ignoreSearch = false } = {}) {
    const siteId = viewModel.site?.id;
    const recruitment = viewModel.pastRecruitments ?? {};
    const livePostings = recruitment.postings ?? [];
    const storedPostings = viewModel.companyData?.postings ?? {};
    const query = ignoreSearch ? "" : viewModel.pastPostingUi?.query ?? "";
    const queryKey = normalizePostingTitle(query);
    if (siteId === "jobkorea" && viewModel.pastPostingUi?.duplicateOnly) {
      return createJobkoreaDuplicateGroups(livePostings).filter(
        (posting) => !queryKey || normalizePostingTitle(posting.title).includes(queryKey)
      ).map((posting) => ({
        posting,
        livePosting: posting,
        storedPosting: storedPostings[posting.id] ?? null,
        unavailable: false
      }));
    }
    const rows = /* @__PURE__ */ new Map();
    for (const livePosting of livePostings) {
      const storedPosting = storedPostings[livePosting.id] ?? null;
      rows.set(livePosting.id, {
        posting: { ...storedPosting ?? {}, ...livePosting },
        livePosting,
        storedPosting,
        unavailable: storedPosting ? isPostingUnavailable({
          savedPosting: storedPosting,
          loadedPostings: livePostings,
          hasMore: recruitment.hasMore
        }) : false
      });
    }
    for (const storedPosting of Object.values(storedPostings)) {
      if (rows.has(storedPosting.id)) continue;
      rows.set(storedPosting.id, {
        posting: storedPosting,
        livePosting: null,
        storedPosting,
        unavailable: isPostingUnavailable({
          savedPosting: storedPosting,
          loadedPostings: livePostings,
          hasMore: recruitment.hasMore
        })
      });
    }
    const rowsById = rows;
    return sortPastPostings(
      [...rows.values()].map((row) => row.posting),
      siteId
    ).map((posting) => rowsById.get(posting.id)).filter(
      (row) => row && (!queryKey || normalizePostingTitle(row.posting.title).includes(queryKey))
    );
  }
  function createPastPostingToolbar(viewModel, actions2) {
    const wrapper = make("div", "hy-past-toolbar");
    const searchRow = make("div", "hy-past-search-row");
    const search = make("input", "hy-past-search-input");
    search.type = "search";
    search.placeholder = "\uC81C\uBAA9 \uAC80\uC0C9";
    search.value = viewModel.pastPostingUi?.query ?? "";
    let searchTimer = null;
    const runSearch = () => actions2.onPastPostingSearch(search.value);
    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 500);
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        clearTimeout(searchTimer);
        runSearch();
      }
    });
    searchRow.append(
      search,
      makeButton(
        "\uC990\uACA8\uCC3E\uAE30 \uB4F1\uB85D",
        "hy-secondary",
        () => actions2.onAddFavoritePostingSearch(search.value)
      )
    );
    const favoriteTags = make("div", "hy-past-favorite-tags");
    for (const favorite of viewModel.settings.favoritePostingSearches ?? []) {
      const tag = make("span", "hy-past-favorite-tag");
      if (favorite === viewModel.pastPostingUi?.query) {
        tag.classList.add("hy-past-favorite-tag-active");
      }
      const selectTag = make("button", "hy-past-favorite-tag-label", favorite);
      selectTag.type = "button";
      selectTag.title = favorite + " \uAC80\uC0C9";
      selectTag.addEventListener(
        "click",
        () => actions2.onSelectFavoritePostingSearch(favorite)
      );
      const removeTag = make("button", "hy-past-favorite-tag-remove", "\xD7");
      removeTag.type = "button";
      removeTag.title = favorite + " \uC990\uACA8\uCC3E\uAE30 \uC0AD\uC81C";
      removeTag.setAttribute("aria-label", removeTag.title);
      removeTag.addEventListener(
        "click",
        () => actions2.onRemoveFavoritePostingSearch(favorite)
      );
      tag.append(selectTag, removeTag);
      favoriteTags.append(tag);
    }
    wrapper.append(searchRow);
    if (favoriteTags.childElementCount > 0) wrapper.append(favoriteTags);
    return wrapper;
  }
  function pastPostingCardClass(row) {
    const posting = row.posting;
    if (row.unavailable) return "hy-past-unavailable";
    if (posting.status === "closed") return "hy-past-closed";
    if ((posting.sixMonthDuplicateCount ?? 0) >= 3) {
      return "hy-past-repeat-high";
    }
    if ((posting.sixMonthDuplicateCount ?? 0) >= 2) {
      return "hy-past-repeat";
    }
    return "";
  }
  function createPastPostingTitle(row, viewModel, actions2) {
    const posting = row.posting;
    if (viewModel.site?.id === "gamejob") {
      return makeButton(
        posting.title,
        "hy-past-title",
        () => actions2.onSelectPastPosting(posting.id)
      );
    }
    if (posting.url) {
      const title = make("a", "hy-past-title", posting.title);
      title.href = posting.url;
      title.target = "_blank";
      title.rel = "noreferrer";
      return title;
    }
    return make("strong", "hy-past-title", posting.title);
  }
  function createPostingSaveButton(row, actions2, { primary = false, getScrollTop = null } = {}) {
    const label = row.storedPosting ? "\uC800\uC7A5 \uAC31\uC2E0" : "\uACF5\uACE0 \uC800\uC7A5";
    const button = makeButton(
      "",
      `${primary ? "hy-primary" : "hy-secondary hy-compact-button"} hy-past-save-button`,
      () => actions2.onSavePastPosting(
        row.livePosting.id,
        typeof getScrollTop === "function" ? getScrollTop() : void 0
      ),
      label
    );
    button.setAttribute("aria-label", label);
    button.append(make("span", "hy-past-save-glyph"));
    return button;
  }
  function createPastPostingCard(row, viewModel, actions2, getScrollTop) {
    const posting = row.posting;
    const stateClass = pastPostingCardClass(row);
    const card = make("article", `hy-past-posting-card ${stateClass}`.trim());
    if (row.unavailable) card.title = "\uC804\uCCB4 \uACF5\uACE0 \uBAA9\uB85D\uC5D0\uC11C URL\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD568";
    const titleRow = make("div", "hy-past-title-row");
    titleRow.append(createPastPostingTitle(row, viewModel, actions2));
    if (row.storedPosting) titleRow.append(make("span", "hy-past-badge", "\uC800\uC7A5"));
    if (row.unavailable) {
      titleRow.append(
        make("span", "hy-past-badge hy-past-badge-attention", "\uB85C\uCEEC\uC5D0\uC11C \uD655\uC778\uBD88\uAC00")
      );
    }
    if (posting.duplicateCount >= 2) {
      titleRow.append(
        make(
          "span",
          "hy-past-badge",
          `\uC911\uBCF5 ${formatNumber(posting.duplicateCount)}\uD68C`
        )
      );
    }
    if (row.livePosting) {
      titleRow.append(createPostingSaveButton(row, actions2, { getScrollTop }));
    }
    card.append(titleRow);
    const meta = make("div", "hy-past-meta");
    const deadline = posting.deadline ? `\uB9C8\uAC10 ${formatDate(posting.deadline)}` : posting.deadlineText ?? "\uB9C8\uAC10\uC77C \uC5C6\uC74C";
    meta.append(make("span", "", deadline));
    if (viewModel.site?.id === "gamejob") {
      meta.append(
        make(
          "span",
          "",
          `\uC774\uC804 \uC218\uC815\uC77C ${getPostingModifiedDate(posting) ?? posting.lastModifiedText ?? "\u2014"}`
        )
      );
    }
    if ((posting.sixMonthDuplicateCount ?? 0) >= 2) {
      meta.append(
        make(
          "span",
          "",
          `6\uAC1C\uC6D4 \uB0B4 ${formatNumber(posting.sixMonthDuplicateCount)}\uD68C`
        )
      );
    }
    if (row.unavailable) {
      meta.append(
        make(
          "span",
          "",
          `\uC800\uC7A5 \uB0A0\uC9DC ${formatSavedTime(row.storedPosting?.savedAt)}`
        ),
        make(
          "span",
          "",
          `\uD655\uC778 \uB0A0\uC9DC ${formatSavedTime(viewModel.pastRecruitments?.linkCheckedAt)}`
        )
      );
    }
    card.append(meta);
    if (posting.duplicateItems?.length > 1) {
      const duplicates = make("div", "hy-past-duplicate-items");
      for (const item of posting.duplicateItems) {
        const rowItem = make("div", "hy-past-duplicate-item");
        const label = item.url ? make("a", "", formatDate(item.deadline)) : make("span", "", formatDate(item.deadline));
        if (item.url) {
          label.href = item.url;
          label.target = "_blank";
          label.rel = "noreferrer";
        }
        rowItem.append(label, make("span", "", item.title));
        duplicates.append(rowItem);
      }
      card.append(duplicates);
    }
    return card;
  }
  function createPastLoadControl(viewModel, actions2, list) {
    const recruitment = viewModel.pastRecruitments ?? {};
    const pageSize = recruitment.pageSize ?? (viewModel.site?.id === "gamejob" ? 10 : 30);
    const loaded = recruitment.loadedPostingCount ?? 0;
    const hasLoadedFirst = recruitment.loadedPages?.includes(1);
    const control = make("div", "hy-past-load-control");
    if (hasLoadedFirst && recruitment.hasMore === false) {
      control.append(
        make(
          "span",
          "hy-past-load-complete",
          `\uC804\uCCB4 ${formatNumber(loaded)}\uAC1C \uC644\uB8CC`
        )
      );
      return control;
    }
    const button = makeButton(
      viewModel.loadingPastPostings ? "\uD638\uCD9C \uC911\u2026" : hasLoadedFirst ? `\uB2E4\uC74C ${pageSize}\uAC1C \uD638\uCD9C` : "\uD638\uCD9C",
      "hy-secondary hy-past-load-button",
      () => actions2.onLoadNextRecruitmentPage(list.scrollTop)
    );
    button.disabled = viewModel.loadingPastPostings;
    control.append(button);
    let loadArmed = false;
    const updateArmed = () => {
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
      loadArmed = atBottom;
      control.classList.toggle("hy-past-load-armed", atBottom);
    };
    list.addEventListener("scroll", updateArmed);
    list.addEventListener("wheel", (event) => {
      if (event.deltaY > 0 && loadArmed && viewModel.settings.scrollLoadPostings && !viewModel.loadingPastPostings) {
        loadArmed = false;
        actions2.onLoadNextRecruitmentPage(list.scrollTop);
      }
    });
    return control;
  }
  function renderGamejobPastPostingDetail(viewModel, actions2, row) {
    const posting = row.posting;
    const wrapper = make("div", "hy-past-detail");
    if (viewModel.settings.simpleMode) {
      wrapper.classList.add("hy-gamejob-simple-selected-posting");
      wrapper.append(
        make("h3", "hy-gamejob-simple-posting-title", posting.title)
      );
      const records = make("div", "hy-gamejob-simple-modification-records");
      appendKeyValue(
        records,
        "\uD604\uC7AC \uC218\uC815 \uAE30\uB85D",
        getPostingModifiedDate(posting) ?? posting.lastModifiedText ?? "\u2014"
      );
      if (row.storedPosting) {
        appendKeyValue(
          records,
          "\uC800\uC7A5\uB41C \uC218\uC815 \uAE30\uB85D",
          getPostingModifiedDate(row.storedPosting) ?? row.storedPosting.lastModifiedText ?? "\u2014"
        );
        appendKeyValue(
          records,
          "\uC800\uC7A5 \uC2DC\uAC01",
          formatSavedTime(row.storedPosting.savedAt)
        );
      }
      wrapper.append(records);
      if (row.livePosting) {
        const controls2 = make("div", "hy-past-detail-controls");
        controls2.append(createPostingSaveButton(row, actions2, { primary: true }));
        wrapper.append(controls2);
      }
      return wrapper;
    }
    const facts = make("div", "hy-past-detail-facts");
    appendKeyValue(facts, "\uC81C\uBAA9", posting.title);
    appendKeyValue(facts, "URL", posting.url ?? "\u2014");
    appendKeyValue(
      facts,
      "\uB9C8\uAC10\uC77C",
      posting.deadline ? formatDate(posting.deadline) : posting.deadlineText ?? "\u2014"
    );
    appendKeyValue(
      facts,
      "\uC774\uC804 \uC218\uC815\uC77C",
      getPostingModifiedDate(posting) ?? posting.lastModifiedText ?? "\u2014"
    );
    wrapper.append(facts);
    const controls = make("div", "hy-past-detail-controls");
    if (posting.url) {
      const original = make("a", "hy-button hy-secondary", "\uC6D0\uBB38 \uC5F4\uAE30");
      original.href = posting.url;
      original.target = "_blank";
      original.rel = "noreferrer";
      controls.append(original);
    }
    if (row.livePosting) {
      controls.append(createPostingSaveButton(row, actions2, { primary: true }));
    }
    wrapper.append(controls);
    return wrapper;
  }
  function createPastPostingsContent(viewModel, actions2) {
    const content = make("div", "hy-past-content");
    const rows = getPastPostingRows(viewModel);
    const allRows = getPastPostingRows(viewModel, { ignoreSearch: true });
    const selectedId = viewModel.pastPostingUi?.selectedPostingId;
    const selectedRow = allRows.find((row) => row.posting.id === selectedId);
    if (viewModel.site?.id === "gamejob") {
      const tabs = make("div", "hy-past-tabs");
      const listTab = makeButton(
        "\uACF5\uACE0 \uBAA9\uB85D",
        "hy-text-button",
        () => actions2.onShowPastPostingList()
      );
      if (!selectedRow) listTab.classList.add("hy-past-tab-active");
      tabs.append(listTab);
      if (selectedRow) {
        const detailTab = makeButton(
          selectedRow.posting.title,
          "hy-text-button hy-past-tab-active",
          () => {
          }
        );
        detailTab.setAttribute("aria-current", "page");
        tabs.append(detailTab);
      }
      content.append(tabs);
      if (selectedRow) {
        content.append(
          renderGamejobPastPostingDetail(viewModel, actions2, selectedRow)
        );
        return content;
      }
    }
    content.append(createPastPostingToolbar(viewModel, actions2));
    const count2 = make(
      "p",
      "hy-past-result-count",
      `\uC804\uCCB4 \uACF5\uACE0 \uC218 ${Number.isFinite(viewModel.pastRecruitments?.totalCount) ? `${formatNumber(viewModel.pastRecruitments.totalCount)}\uAC1C` : "\uD655\uC778 \uC804"} \xB7 ${formatNumber(viewModel.pastRecruitments?.loadedPostingCount ?? 0)}\uAC1C \uBD88\uB7EC\uC634`
    );
    content.append(count2);
    const list = make("div", "hy-past-posting-list");
    if (rows.length === 0) {
      list.append(
        make(
          "p",
          "hy-empty",
          viewModel.pastPostingUi?.duplicateOnly ? "\uC911\uBCF5 \uACF5\uACE0\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." : "\uD45C\uC2DC\uD560 \uACFC\uAC70 \uACF5\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
        )
      );
    } else {
      for (const row of rows) {
        list.append(
          createPastPostingCard(row, viewModel, actions2, () => list.scrollTop)
        );
      }
    }
    const savedScrollTop = Number(viewModel.pastPostingUi?.scrollTop) || 0;
    queueMicrotask(() => {
      if (list.isConnected) list.scrollTop = savedScrollTop;
    });
    content.append(list, createPastLoadControl(viewModel, actions2, list));
    return content;
  }

  // src/ui/pension-sections.js
  function formatPensionSignal(value) {
    return Number.isFinite(value) ? `${value}%` : "\uD655\uC778 \uBD88\uAC00";
  }
  function createPensionScoreBadge(label, result, className = "") {
    const nameSignal = `\uC774\uB984 ${formatPensionSignal(result.signals?.name)}`;
    const addressSignal = `\uC8FC\uC18C ${formatPensionSignal(result.signals?.address)}`;
    const badge = make(
      "span",
      `hy-score hy-pension-score ${className}`.trim(),
      label
    );
    badge.tabIndex = 0;
    badge.setAttribute("aria-label", `${label}. ${nameSignal}. ${addressSignal}`);
    const tooltip = make("span", "hy-help-tooltip hy-pension-score-tooltip");
    tooltip.append(make("span", "", nameSignal), make("span", "", addressSignal));
    badge.append(tooltip);
    return badge;
  }
  function findBoundPensionResult(viewModel) {
    const results = viewModel.pensionPoolUi?.results ?? [];
    const manualMatch = viewModel.pensionBinding;
    if (manualMatch) {
      const matched = results.find(
        (result) => isSamePensionMatch(manualMatch, {
          name: result.name,
          address: result.matchedAddress
        })
      );
      if (matched) return matched;
    }
    return results.find((result) => result.manualBind || result.directoryBind) ?? null;
  }
  function getDefaultExpandedPensionResultIndex(results, boundMatch, cachedMatch) {
    const topResult = results?.[0];
    if (!topResult) return -1;
    const matchTarget = {
      name: topResult.name,
      address: topResult.matchedAddress
    };
    const preferred = Boolean(
      topResult.manualBind || topResult.directoryBind || isSamePensionMatch(boundMatch, matchTarget) || isSamePensionMatch(cachedMatch, matchTarget)
    );
    const topNameScore = topResult.signals?.name ?? topResult.score;
    return preferred || Number(topNameScore) >= 90 ? 0 : -1;
  }
  function getPensionVersionStatus(viewModel) {
    const policy = viewModel.pensionPolicy ?? {};
    const status = viewModel.pensionPolicyStatus ?? {};
    if (!policy.requiredLatestMonth || status.checkDue) {
      return { label: "\uD655\uC778 \uBD88\uAC00", className: "hy-version-status-unknown" };
    }
    if (!status.latestInstalled) {
      return { label: "\uC124\uCE58 \uD544\uC694", className: "hy-version-status-required" };
    }
    return { label: "\uCD5C\uC2E0 \uBC84\uC804", className: "hy-version-status-current" };
  }
  function renderPensionActivity(activity) {
    if (!activity?.busy) return null;
    const status = make("div", "hy-pension-activity");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.append(
      make("span", "hy-pension-spinner"),
      make("span", "", activity.label ?? "\uC5F0\uAE08 \uB370\uC774\uD130 \uCC98\uB9AC \uC911")
    );
    return status;
  }
  function renderPensionPoolSearch(container, viewModel, actions2) {
    const summary = viewModel.pensionPoolSummary;
    const ui = viewModel.pensionPoolUi;
    const activity = renderPensionActivity(viewModel.pensionActivity);
    if (activity) container.append(activity);
    if (!summary?.companyCount) {
      container.append(
        make("p", "hy-empty", "\uBA3C\uC800 \uAD6D\uBBFC\uC5F0\uAE08 CSV\uB97C \uC5F0\uAE08 \uD480\uC5D0 \uCD94\uAC00\uD558\uC138\uC694."),
        makeButton(
          "\uC5F0\uAE08 CSV \uCD94\uAC00",
          "hy-primary",
          () => actions2.onPickPensionCsvFiles()
        )
      );
      return;
    }
    const searchRow = make("div", "hy-pension-search-row");
    const input = make("input", "hy-input");
    input.type = "search";
    input.placeholder = "\uD68C\uC0AC\uBA85 \uAC80\uC0C9";
    input.value = ui?.query ?? "";
    const search = () => actions2.onSearchPensionPool(input.value);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") search();
    });
    searchRow.append(
      input,
      makeButton(
        "\uAC80\uC0C9",
        "hy-primary",
        search,
        "\uC5F0\uAE08 \uD480\uC5D0\uC11C \uD68C\uC0AC\uBA85\uB9CC \uAC80\uC0C9\uD574 \uC0C1\uC704 5\uAC1C\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4."
      )
    );
    container.append(searchRow);
    if (!ui?.searched) {
      container.append(
        make(
          "p",
          "hy-empty hy-pension-search-help",
          "\uD68C\uC0AC\uBA85\uC744 \uC785\uB825\uD558\uBA74 \uC0C1\uC704 5\uAC1C \uC5F0\uAE08 \uC0AC\uC5C5\uC7A5\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4."
        )
      );
      return;
    }
    if (ui.results.length === 0) {
      container.append(make("p", "hy-empty", "\uC77C\uCE58\uD558\uB294 \uC5F0\uAE08 \uD68C\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."));
      return;
    }
    const resultList = make("div", "hy-pension-result-list");
    const expandedResultIndex = getDefaultExpandedPensionResultIndex(
      ui.results,
      viewModel.pensionBinding,
      viewModel.pensionCachedMatch
    );
    for (const [resultIndex, result] of ui.results.entries()) {
      const company = make("article", "hy-pension-result-company");
      const companyTop = make("div", "hy-pension-result-top");
      const companyDetails = make("div", "hy-pension-result-details");
      const initiallyExpanded = resultIndex === expandedResultIndex;
      company.classList.toggle(
        "hy-pension-result-company-collapsed",
        !initiallyExpanded
      );
      companyDetails.hidden = !initiallyExpanded;
      const manuallyBound = Boolean(
        result.manualBind || isSamePensionMatch(viewModel.pensionBinding, {
          name: result.name,
          address: result.matchedAddress
        })
      );
      const lowAddressBinding = Boolean(
        manuallyBound && viewModel.pensionBinding?.addressWarning
      );
      if (lowAddressBinding) {
        company.classList.add("hy-pension-result-company-warning");
        company.title = "\uC8FC\uC18C \uC77C\uCE58\uC728 30% \uBBF8\uB9CC \uB610\uB294 \uD655\uC778 \uBD88\uAC00 \uC0C1\uD0DC\uC5D0\uC11C \uBC14\uC778\uB4DC\uB428";
      }
      const directoryBound = Boolean(result.directoryBind && !manuallyBound);
      const bindRestriction = getPensionBindingRestriction(
        result,
        viewModel.pensionBindingEmployeeCount,
        viewModel.pensionBindingSourceName
      );
      const actionsRow = make("div", "hy-pension-result-actions");
      const bindButton = makeButton(
        manuallyBound || directoryBound ? "\uBC14\uC778\uB4DC \uD574\uC81C" : "\uBC14\uC778\uB4DC",
        manuallyBound || directoryBound ? "hy-secondary hy-compact-button" : "hy-primary hy-compact-button",
        () => manuallyBound || directoryBound ? actions2.onUnbindPensionCompany() : actions2.onBindPensionCompany(result),
        manuallyBound ? `${viewModel.pensionBindingSourceName}\uC758 \uC218\uB3D9 \uBC14\uC778\uB4DC \uD574\uC81C` : directoryBound ? `${viewModel.pensionBindingSourceName}\uC758 \uAE30\uBCF8 \uBC14\uC778\uB529 \uD574\uC81C` : bindRestriction || `${viewModel.pensionBindingSourceName || "\uAC80\uC0C9\uC5B4"}\uC640 \uC774 \uC5F0\uAE08 \uD68C\uC0AC\uB97C 1:1\uB85C \uC5F0\uACB0`
      );
      bindButton.disabled = !manuallyBound && !directoryBound && Boolean(bindRestriction);
      const collapseButton = makeButton(
        "",
        "hy-pension-company-toggle",
        () => {
          const collapsed = company.classList.toggle(
            "hy-pension-result-company-collapsed"
          );
          companyDetails.hidden = collapsed;
          collapseButton.setAttribute("aria-expanded", String(!collapsed));
          const toggleLabel = collapsed ? "\uD68C\uC0AC \uC0C1\uC138 \uD3BC\uCE58\uAE30" : "\uD68C\uC0AC \uC0C1\uC138 \uC811\uAE30";
          collapseButton.title = toggleLabel;
          collapseButton.setAttribute("aria-label", toggleLabel);
        },
        initiallyExpanded ? "\uD68C\uC0AC \uC0C1\uC138 \uC811\uAE30" : "\uD68C\uC0AC \uC0C1\uC138 \uD3BC\uCE58\uAE30"
      );
      collapseButton.setAttribute("aria-expanded", String(initiallyExpanded));
      collapseButton.setAttribute(
        "aria-label",
        initiallyExpanded ? "\uD68C\uC0AC \uC0C1\uC138 \uC811\uAE30" : "\uD68C\uC0AC \uC0C1\uC138 \uD3BC\uCE58\uAE30"
      );
      collapseButton.append(make("span", "hy-pension-company-chevron"));
      actionsRow.append(bindButton, collapseButton);
      const scoreBadge = manuallyBound ? createPensionScoreBadge("\uC218\uB3D9 \uBC14\uC778\uB4DC", result, "hy-score-manual") : directoryBound ? createPensionScoreBadge("\uAE30\uBCF8 \uBC14\uC778\uB529", result, "hy-score-manual") : createPensionScoreBadge(`${result.score}\uC810`, result);
      companyTop.append(
        make("strong", "hy-pension-result-name", result.name),
        scoreBadge,
        actionsRow
      );
      company.append(
        companyTop,
        make(
          "p",
          "hy-pension-result-meta",
          result.latest ? `\uCD5C\uC2E0 \uAC00\uC785\uC790 ${formatNumber(result.latest.subscribers)}\uBA85 \xB7 ${result.latest.month}` : "\uCD5C\uC2E0 \uAC00\uC785\uC790 \uD655\uC778 \uBD88\uAC00"
        )
      );
      for (const location2 of result.locations) {
        const address = location2.address ?? null;
        const locationBlock = make("div", "hy-pension-location");
        locationBlock.append(
          make("p", "hy-pension-location-address", address ?? "\uC8FC\uC18C \uBBF8\uAE30\uB85D")
        );
        const months = make("div", "hy-pension-month-list");
        const orderedMonths = Object.entries(location2.months).sort(
          ([left], [right]) => right.localeCompare(left)
        );
        for (const [monthIndex, [month, snapshot]] of orderedMonths.entries()) {
          const row = make("div", "hy-pension-month-row");
          row.classList.toggle("hy-pension-month-row-latest", monthIndex === 0);
          const values = make("span", "hy-pension-month-values");
          values.append(
            make("strong", "", month),
            document.createTextNode(
              ` \uAE30\uC874 \uAC00\uC785\uC790 \uC218 ${formatNumber(snapshot.subscribers)} \xB7 ${PENSION_ACQUISITION_LABEL} ${formatNumber(snapshot.joined)} \xB7 ${PENSION_LOSS_LABEL} ${formatNumber(snapshot.left)}`
            )
          );
          row.append(values);
          months.append(row);
        }
        locationBlock.append(months);
        companyDetails.append(locationBlock);
      }
      company.append(companyDetails);
      resultList.append(company);
    }
    container.append(resultList);
  }
  function renderWorkforce(viewModel, actions2) {
    const pensionSummary = viewModel.pensionPoolSummary;
    const { details, content, heading } = createSection(
      "\uC5F0\uAE08 \uBE44\uAD50",
      "workforce",
      viewModel.settings,
      actions2,
      {
        helpContent: [
          "\uD68C\uC0AC\uBA85\uC73C\uB85C \uAD6D\uBBFC\uC5F0\uAE08 \uC0AC\uC5C5\uC7A5 \uD6C4\uBCF4\uB97C \uAC80\uC0C9\uD569\uB2C8\uB2E4.",
          `\uD68C\uC0AC ${formatNumber(pensionSummary?.companyCount)}\uAC1C`,
          `\uC6D4 \uAE30\uB85D ${formatNumber(pensionSummary?.snapshotCount)}\uAC1C`
        ]
      }
    );
    const companyCount = Number(pensionSummary?.companyCount);
    if (Number.isFinite(companyCount) && companyCount > 0 && companyCount <= 2e3) {
      heading.append(
        createHelpMark(
          [
            "[\uAC8C\uC784\uC7A1 \uAE30\uBCF8 \uC138\uD305 \uC0AC\uC6A9\uC911]",
            "\uC5F0\uAE08 \uB370\uC774\uD130\uC5D0\uC11C \uCD5C\uC2E0 \uAE30\uB85D\uC744 \uB2E4\uC6B4\uB85C\uB4DC \uD558\uC138\uC694"
          ],
          "hy-pension-pool-hint",
          "\u{1F4A1}"
        )
      );
    }
    renderPensionPoolSearch(content, viewModel, actions2);
    return details;
  }
  function renderPensionData(viewModel, actions2) {
    const { details, content, headerActions } = createSection(
      "\uC5F0\uAE08 \uB370\uC774\uD130",
      "pensionData",
      viewModel.settings,
      actions2
    );
    const versionStatus = getPensionVersionStatus(viewModel);
    headerActions.append(
      make(
        "span",
        `hy-version-status ${versionStatus.className}`,
        versionStatus.label
      )
    );
    const pension = viewModel.pensionPoolSummary;
    const activity = renderPensionActivity(viewModel.pensionActivity);
    if (activity) content.append(activity);
    const monthRange = pension?.latestMonth ? pension.latestMonth === pension.oldestMonth ? pension.latestMonth : `${pension.latestMonth} ~ ${pension.oldestMonth}` : "\uC6D4 \uB370\uC774\uD130 \uC5C6\uC74C";
    content.append(
      make(
        "p",
        "hy-version hy-pension-summary",
        `\uD68C\uC0AC ${formatNumber(pension?.companyCount)}\uAC1C \xB7 \uC8FC\uC18C ${formatNumber(pension?.locationCount)}\uAC1C \xB7 \uC6D4 \uC2A4\uB0C5\uC0F7 ${formatNumber(pension?.snapshotCount)}\uAC1C \xB7 ${monthRange}`
      )
    );
    const controls = make("div", "hy-data-controls");
    controls.append(
      makeButton(
        "\uACF5\uACF5\uB370\uC774\uD130\uD3EC\uD138 \uC5F4\uAE30 \u2197",
        "hy-secondary",
        () => actions2.onOpenPensionDataPortal()
      ),
      makeButton(
        "\uC5F0\uAE08 CSV \uCD94\uAC00",
        "hy-secondary",
        () => actions2.onPickPensionCsvFiles()
      )
    );
    content.append(
      controls,
      renderPensionMonthManager(viewModel, actions2),
      renderPensionPortalControls(viewModel, actions2)
    );
    return details;
  }
  function renderPensionMonthManager(viewModel, actions2) {
    const wrapper = make("div", "hy-pension-source-block");
    wrapper.append(
      make("h4", "hy-pension-source-title", "\uC800\uC7A5\uB41C \uC6D4 \uC0AD\uC81C"),
      make(
        "p",
        "hy-option-description",
        "\uC120\uD0DD\uD55C \uC6D4\uC744 \uBAA8\uB4E0 \uD68C\uC0AC\uC640 \uC8FC\uC18C\uC5D0\uC11C \uC0AD\uC81C\uD569\uB2C8\uB2E4."
      )
    );
    const months = make("div", "hy-pension-stored-months");
    for (const month of viewModel.pensionPoolSummary?.months ?? []) {
      const row = make("div", "hy-pension-stored-month");
      row.append(
        make("strong", "", month),
        makeButton(
          "\uC0AD\uC81C",
          "hy-attention hy-compact-button",
          () => {
            if (confirm(`${month} \uC5F0\uAE08 \uAE30\uB85D\uC744 \uBAA8\uB4E0 \uD68C\uC0AC\uC5D0\uC11C \uC0AD\uC81C\uD560\uAE4C\uC694?`)) {
              actions2.onDeletePensionPoolMonth(month);
            }
          },
          `${month} \uC804\uCCB4 \uC0AD\uC81C`
        )
      );
      months.append(row);
    }
    wrapper.append(
      months.childElementCount ? months : make("p", "hy-empty", "\uC0AD\uC81C\uD560 \uC6D4 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.")
    );
    return wrapper;
  }
  function renderPensionPortalControls(viewModel, actions2) {
    const wrapper = make("div", "hy-pension-source-block");
    const busy = Boolean(viewModel.pensionActivity?.busy);
    wrapper.append(
      make("h4", "hy-pension-source-title", "\uACF5\uACF5\uB370\uC774\uD130\uD3EC\uD138 \uC6D4\uBCC4 CSV"),
      make(
        "p",
        "hy-option-description",
        "\uACF5\uAC1C \uD30C\uC77C \uC5F0\uB3C4\uB97C \uC120\uD0DD\uD55C \uB4A4 \uBAA9\uB85D\uB9CC \uD55C \uBC88 \uC870\uD68C\uD569\uB2C8\uB2E4. \uC120\uD0DD\uD55C \uC6D4\uC740 \uBCC4\uB3C4 \uB2E4\uC6B4\uB85C\uB4DC \uC5C6\uC774 \uC5F0\uAE08 \uD480\uC5D0 \uBC14\uB85C \uAC00\uACF5\xB7\uBCD1\uD569\uD569\uB2C8\uB2E4."
      )
    );
    const controls = make("div", "hy-pension-portal-controls");
    const year = make("select", "hy-input hy-pension-year-select");
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    for (let value = currentYear; value >= PENSION_PORTAL_EARLIEST_YEAR; value -= 1) {
      const option = make("option", "", `${value}\uB144`);
      option.value = String(value);
      option.selected = value === viewModel.pensionPortalUi.year;
      year.append(option);
    }
    const load = makeButton(
      viewModel.pensionPortalUi.loading ? "\uC870\uD68C \uC911\u2026" : "\uC6D4\uBCC4 \uBAA9\uB85D \uC870\uD68C",
      "hy-secondary",
      () => actions2.onLoadPensionPortalYear(Number(year.value))
    );
    load.disabled = viewModel.pensionPortalUi.loading || busy;
    controls.append(year, load);
    wrapper.append(controls);
    if (viewModel.pensionPortalUi.loadedYear === viewModel.pensionPortalUi.year) {
      const files = make("div", "hy-pension-portal-files");
      const requiredLatestMonth = viewModel.pensionPolicy?.requiredLatestMonth ?? null;
      const latestInstalled = Boolean(
        viewModel.pensionPolicyStatus?.latestInstalled
      );
      const policyCheckDue = Boolean(viewModel.pensionPolicyStatus?.checkDue);
      for (const file of viewModel.pensionPortalUi.files) {
        const row = make("div", "hy-pension-portal-file");
        const month = file.month ?? getPensionPortalFileMonth(file.name) ?? "\uB0A0\uC9DC \uBBF8\uC0C1";
        const isLatest = month === requiredLatestMonth;
        if (isLatest) row.classList.add("hy-pension-portal-file-latest");
        const importButton = makeButton(
          isLatest ? latestInstalled ? "\uCD5C\uC2E0 \uB2E4\uC2DC \uCD94\uAC00" : "\uCD5C\uC2E0 \uBA3C\uC800 \uCD94\uAC00" : "\uD480\uC5D0 \uBC14\uB85C \uCD94\uAC00",
          "hy-secondary hy-compact-button",
          () => actions2.onImportPensionPortalFile(file)
        );
        importButton.disabled = busy || policyCheckDue || !latestInstalled && !isLatest;
        if (!latestInstalled && !isLatest) {
          importButton.title = `\uCD5C\uC2E0 ${requiredLatestMonth ?? "\uC6D4"} \uD30C\uC77C\uC744 \uBA3C\uC800 \uCD94\uAC00\uD574\uC57C \uD569\uB2C8\uB2E4.`;
        }
        row.append(
          make("span", "hy-pension-portal-month", month),
          ...isLatest ? [make("span", "hy-pension-latest-badge", "\uCD5C\uC2E0")] : [],
          importButton
        );
        row.title = file.name;
        files.append(row);
      }
      wrapper.append(
        files.childElementCount ? files : make("p", "hy-empty", "\uC120\uD0DD\uD55C \uC5F0\uB3C4\uC758 \uACF5\uAC1C \uD30C\uC77C\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.")
      );
    }
    return wrapper;
  }

  // src/ui/site-sections.js
  function createDonutChart(title, items, centerLabel, centerValue) {
    const card = make("article", "hy-recruitment-chart-card");
    card.append(make("h3", "hy-recruitment-chart-title", title));
    const total = items.reduce(
      (sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0),
      0
    );
    let cursor = 0;
    const stops = [];
    for (const item of items) {
      const start = total > 0 ? cursor / total * 360 : 0;
      cursor += Number.isFinite(item.value) ? item.value : 0;
      const end = total > 0 ? cursor / total * 360 : 0;
      if (end > start) stops.push(`${item.color} ${start}deg ${end}deg`);
    }
    const donut = make("div", "hy-recruitment-donut");
    donut.style.background = stops.length ? `conic-gradient(${stops.join(", ")})` : "#e8edf5";
    const center = make("div", "hy-recruitment-donut-center");
    center.append(make("span", "", centerLabel), make("strong", "", centerValue));
    donut.append(center);
    card.append(donut);
    const legend = make("div", "hy-recruitment-legend");
    for (const item of items) {
      const row = make("div", "hy-recruitment-legend-row");
      const label = make("span", "hy-recruitment-legend-label");
      const dot = make("i", "hy-recruitment-legend-dot");
      dot.style.background = item.color;
      label.append(dot, document.createTextNode(item.label));
      row.append(label, make("strong", "", formatNumber(item.value)));
      legend.append(row);
    }
    card.append(legend);
    return card;
  }
  function renderRecruitmentCompanyInfo(viewModel, actions2) {
    const { details, content, headerActions } = createSection(
      "\uCC44\uC6A9 \uD68C\uC0AC \uC815\uBCF4",
      "companyInfo",
      viewModel.settings,
      actions2
    );
    const companyInfo = viewModel.recruitmentCompanyInfo;
    headerActions.append(
      createSectionActionButton("\uD68C\uC0AC\uC815\uBCF4 \uC790\uB3D9 \uD638\uCD9C", {
        active: Boolean(viewModel.settings.autoCompanyInfo),
        title: "\uACF5\uACE0\uB97C \uC5F4 \uB54C \uD68C\uC0AC\uC815\uBCF4 \uC790\uB3D9 \uBD88\uB7EC\uC624\uAE30",
        onClick: () => actions2.onSettingsChange({
          autoCompanyInfo: !viewModel.settings.autoCompanyInfo
        })
      })
    );
    if (viewModel.loadingRecruitmentCompanyInfo) {
      headerActions.append(createSectionSpinner("\uD68C\uC0AC\uC815\uBCF4 \uBD88\uB7EC\uC624\uB294 \uC911"));
    }
    content.append(
      make(
        "p",
        "hy-recruitment-source",
        "\uC7A1\uCF54\uB9AC\uC544 \uAE30\uC5C5 \uC0C1\uC138\uC815\uBCF4 \uAE30\uC900 \xB7 \uCD5C\uADFC 3\uB144"
      )
    );
    if (!companyInfo?.informationLoaded) {
      const automatic = viewModel.settings.autoCompanyInfo;
      content.append(
        make(
          "p",
          "hy-empty hy-compact",
          automatic ? "\uC790\uB3D9 \uD68C\uC0AC\uC815\uBCF4\uAC00 \uCF1C\uC838 \uC788\uC2B5\uB2C8\uB2E4. \uACF5\uACE0\uB97C \uC5F4\uBA74 \uC7A0\uC2DC \uD6C4 \uBD88\uB7EC\uC635\uB2C8\uB2E4." : "\uC790\uB3D9 \uD68C\uC0AC\uC815\uBCF4\uAC00 \uAEBC\uC838 \uC788\uC5B4 \uC544\uC9C1 \uC11C\uBC84\uC5D0 \uC694\uCCAD\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
        ),
        (() => {
          const loadButton = makeButton(
            viewModel.loadingRecruitmentCompanyInfo ? "\uBD88\uB7EC\uC624\uB294 \uC911\u2026" : "\uBD88\uB7EC\uC624\uAE30",
            "hy-primary hy-company-info-load",
            () => actions2.onLoadRecruitmentCompanyInfo(),
            "\uD68C\uC0AC \uC0C1\uC138\uC815\uBCF4 \uBD88\uB7EC\uC624\uAE30"
          );
          loadButton.disabled = viewModel.loadingRecruitmentCompanyInfo;
          return loadButton;
        })()
      );
      return details;
    }
    const history = companyInfo.employmentHistory;
    const experience = history?.experienceType;
    const employment = history?.employmentType;
    const totalCount = history?.totalCount;
    const facts = make("div", "hy-recruitment-company-facts");
    appendKeyValue(
      facts,
      "\uC7A1\uCF54\uB9AC\uC544 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218",
      Number.isFinite(companyInfo.employeeCount) ? `${formatNumber(companyInfo.employeeCount)}\uBA85` : "\u2014"
    );
    appendKeyValue(facts, "\uC8FC\uC18C", companyInfo.address ?? "\u2014");
    content.append(facts);
    if (!history) {
      content.append(
        make("p", "hy-empty", "\uCD5C\uADFC \uCC44\uC6A9 History \uC815\uBCF4\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.")
      );
      return details;
    }
    const charts = make("div", "hy-recruitment-charts");
    charts.append(
      createDonutChart(
        "\uACF5\uACE0 \uBD84\uD3EC",
        [
          {
            label: "\uACBD\uB825",
            value: experience?.experiencedCount ?? 0,
            color: "#68afe5"
          },
          {
            label: "\uC2E0\uC785/\uACBD\uB825",
            value: experience?.noExperienceRequiredCount ?? 0,
            color: "#ff646d"
          },
          {
            label: "\uC2E0\uC785",
            value: experience?.entryCount ?? 0,
            color: "#ffb11b"
          }
        ],
        "\uCD5C\uADFC 3\uB144",
        `${formatNumber(totalCount)}\uAC74`
      ),
      createDonutChart(
        "\uACE0\uC6A9 \uD615\uD0DC",
        [
          {
            label: "\uC815\uADDC\uC9C1",
            value: employment?.regularCount ?? 0,
            color: "#3895e8"
          },
          {
            label: "\uBE44\uC815\uADDC\uC9C1",
            value: employment?.nonRegularCount ?? 0,
            color: "#9dacc3"
          }
        ],
        "\uCC44\uC6A9 \uD69F\uC218",
        `${formatNumber(totalCount)}\uAC74`
      )
    );
    content.append(charts);
    return details;
  }
  function formatRecordTime(value) {
    const date = new Date(value ?? "");
    return Number.isNaN(date.getTime()) ? "\u2014" : date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function renderGamejobOfficialWorkforce(viewModel, actions2) {
    const block = make("section", "hy-general-block");
    block.append(
      make("h3", "hy-general-block-title", "\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218")
    );
    const current = make("div", "hy-general-current-row");
    current.append(
      make(
        "strong",
        "hy-general-large-value",
        Number.isFinite(viewModel.officialEmployeeCount) ? `${formatNumber(viewModel.officialEmployeeCount)}\uBA85` : "\uD655\uC778 \uBD88\uAC00"
      )
    );
    const saveButton = makeButton(
      "\uC800\uC7A5",
      "hy-primary",
      () => actions2.onSaveOfficialWorkforce()
    );
    saveButton.disabled = !Number.isFinite(viewModel.officialEmployeeCount);
    current.append(saveButton);
    block.append(current);
    const records = viewModel.companyData?.gamejobOfficialWorkforceHistory ?? [];
    const history = make("details", "hy-general-history");
    const summary = make("summary", "hy-general-history-summary");
    summary.append(
      make("span", "", `\uACFC\uAC70 \uAE30\uB85D ${formatNumber(records.length)}\uAC1C`),
      make("span", "hy-general-history-chevron")
    );
    history.append(summary);
    const list = make("div", "hy-general-history-list");
    if (records.length === 0) {
      list.append(
        make("p", "hy-empty hy-compact", "\uC800\uC7A5\uB41C \uC778\uB825 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")
      );
    } else {
      for (const record of records) {
        const row = make("div", "hy-general-history-row");
        const copy = make("span", "hy-general-history-copy");
        copy.append(
          make("strong", "", `${formatNumber(record.employeeCount)}\uBA85`),
          make("small", "", formatRecordTime(record.savedAt))
        );
        row.append(
          copy,
          makeButton(
            "\uC0AD\uC81C",
            "hy-attention hy-compact-button",
            () => {
              if (confirm("\uC774 \uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?")) {
                actions2.onDeleteOfficialWorkforceRecord(record.id);
              }
            },
            "\uC774 \uC778\uB825 \uAE30\uB85D\uB9CC \uC0AD\uC81C"
          )
        );
        list.append(row);
      }
    }
    history.append(list);
    block.append(history);
    return block;
  }
  function renderPensionOfficialWorkforce(viewModel) {
    const result = findBoundPensionResult(viewModel);
    const block = make("section", "hy-general-block");
    const heading = make(
      "h3",
      "hy-general-block-title",
      "\uAD6D\uBBFC\uC5F0\uAE08 \uC0AC\uC5C5\uC7A5 \uAC00\uC785\uC790 \uD604\uD669"
    );
    heading.title = "\uAD6D\uBBFC\uC5F0\uAE08 \uC7A5\uAE30\uAC00\uC785\uC790 \uC218\uC774\uBA70 \uC2E4\uC81C \uC9C1\uC6D0 \uC218\uC640 \uB2E4\uB97C \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    block.append(heading);
    if (!result?.latest) {
      block.append(
        make("p", "hy-empty hy-compact", "\uBC14\uC778\uB4DC\uB41C \uAD6D\uBBFC\uC5F0\uAE08 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")
      );
      return block;
    }
    const facts = make("div", "hy-general-pension-values");
    for (const [label, value] of [
      ["\uAC00\uC785\uC790 \uC218", result.latest.subscribers],
      [PENSION_ACQUISITION_LABEL, result.latest.joined],
      [PENSION_LOSS_LABEL, result.latest.left]
    ]) {
      appendKeyValue(
        facts,
        label,
        Number.isFinite(value) ? `${formatNumber(value)}\uBA85` : "\u2014"
      );
    }
    block.append(
      make("p", "hy-general-pension-month", `${result.latest.month} \uAE30\uC900`),
      facts,
      make(
        "p",
        "hy-general-pension-warning",
        `\uC9C1\uC6D0 \uC218\uAC00 \uC544\uB2D9\uB2C8\uB2E4. ${PENSION_ACQUISITION_WARNING} ${PENSION_LOSS_WARNING}`
      )
    );
    return block;
  }
  function renderGamejobPostingDetailRecords(viewModel, actions2) {
    const block = make("section", "hy-general-block");
    block.append(make("h3", "hy-general-block-title", "\uC0C1\uC138 \uC218\uC815 \uC2DC\uAC04\uACFC \uAE30\uB85D"));
    const posting = viewModel.posting;
    if (!posting) {
      block.append(
        make(
          "p",
          "hy-empty hy-compact",
          "\uAC8C\uC784\uC7A1 \uC0C1\uC138 \uACF5\uACE0 \uD398\uC774\uC9C0\uC5D0\uC11C \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
        )
      );
      return block;
    }
    const facts = make("div", "hy-posting-detail-facts");
    appendKeyValue(
      facts,
      "\uACF5\uACE0 \uB4F1\uB85D\uC2DC\uAC04",
      posting.registeredText ?? posting.registeredAt ?? posting.openedAt ?? "\u2014"
    );
    appendKeyValue(
      facts,
      "\uB9C8\uC9C0\uB9C9 \uC218\uC815 \uC2DC\uAC04",
      posting.lastModifiedText ?? posting.lastModifiedAt ?? "\u2014"
    );
    const saveButton = makeButton(
      "\uC0C1\uC138 \uAE30\uB85D \uC800\uC7A5",
      "hy-primary hy-save-action",
      () => actions2.onSaveGamejobPostingDetail()
    );
    block.append(facts, saveButton);
    const records = viewModel.companyData?.gamejobPostingDetails?.[posting.id]?.records ?? [];
    const history = make("details", "hy-general-history");
    const summary = make("summary", "hy-general-history-summary");
    summary.append(
      make("span", "", `\uC800\uC7A5 \uAE30\uB85D ${formatNumber(records.length)}\uAC1C`),
      make("span", "hy-general-history-chevron")
    );
    history.append(summary);
    const list = make("div", "hy-general-history-list");
    if (records.length === 0) {
      list.append(
        make("p", "hy-empty hy-compact", "\uC800\uC7A5\uB41C \uC0C1\uC138 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")
      );
    } else {
      for (const record of records) {
        const row = make("div", "hy-general-posting-record");
        row.append(
          make(
            "strong",
            "",
            record.lastModifiedText ?? record.lastModifiedAt ?? "\uC218\uC815\uC2DC\uAC04 \uD655\uC778 \uBD88\uAC00"
          ),
          make(
            "span",
            "",
            `\uB4F1\uB85D ${record.registeredText ?? record.registeredAt ?? "\u2014"}`
          ),
          make("small", "", `\uC800\uC7A5 ${formatRecordTime(record.savedAt)}`)
        );
        list.append(row);
      }
    }
    history.append(list);
    block.append(history);
    return block;
  }
  function renderGamejobGeneral(viewModel, actions2) {
    const { details, content } = createSection(
      "\uC77C\uBC18",
      "postingDetails",
      viewModel.settings,
      actions2
    );
    content.append(
      renderPensionOfficialWorkforce(viewModel),
      renderGamejobOfficialWorkforce(viewModel, actions2),
      renderGamejobPostingDetailRecords(viewModel, actions2)
    );
    return details;
  }
  function renderPastPostings(viewModel, actions2) {
    const { details, content, headerActions, heading } = createSection(
      viewModel.site?.id === "gamejob" ? "\uACF5\uACE0 \uC0C1\uC138" : "\uACF5\uACE0 \uD638\uCD9C",
      "pastPostings",
      viewModel.settings,
      actions2
    );
    if (viewModel.site?.id === "jobkorea") {
      headerActions.append(
        createSectionActionButton("\uC911\uBCF5 \uACC4\uC0B0", {
          active: Boolean(viewModel.pastPostingUi?.duplicateOnly),
          title: viewModel.pastPostingUi?.duplicateOnly ? "\uC911\uBCF5 \uACC4\uC0B0\uC744 \uB044\uACE0 \uC804\uCCB4 \uACF5\uACE0\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4." : "\uC81C\uBAA9\uC774 \uAC19\uC740 \uACF5\uACE0\uB97C \uB9C8\uAC10\uC77C \uAE30\uC900\uC73C\uB85C \uBB36\uC2B5\uB2C8\uB2E4.",
          onClick: () => actions2.onPastPostingCalculateDuplicates(
            viewModel.pastPostingUi?.query ?? ""
          )
        })
      );
    }
    headerActions.append(
      createSectionActionButton("\uACF5\uACE0 \uC790\uB3D9 \uD638\uCD9C", {
        active: Boolean(viewModel.settings.autoPastPostings),
        title: "\uACF5\uACE0\uB97C \uC5F4 \uB54C \uCCAB \uD398\uC774\uC9C0 \uC790\uB3D9 \uD638\uCD9C",
        onClick: () => actions2.onSettingsChange({
          autoPastPostings: !viewModel.settings.autoPastPostings
        })
      })
    );
    if (viewModel.loadingPastPostings) {
      headerActions.append(createSectionSpinner("\uACF5\uACE0 \uD638\uCD9C \uC911"));
    }
    const hasStoredPostings = Object.keys(viewModel.companyData?.postings ?? {}).length > 0;
    const hasIncompletePages = viewModel.pastRecruitments?.hasMore !== false;
    if (hasStoredPostings || hasIncompletePages) {
      heading.append(
        createHelpMark(
          "\uBAA8\uB4E0 \uD398\uC774\uC9C0\uB97C \uC870\uD68C\uD574\uC57C \uC800\uC7A5\uB41C \uACF5\uACE0 \uB9C1\uD06C \uD655\uC778\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4",
          "hy-past-link-hint",
          "\u{1F4A1}"
        )
      );
    }
    content.append(createPastPostingsContent(viewModel, actions2));
    return details;
  }
  function renderGamejobEnhancedSearch(viewModel, actions2) {
    const { details, content } = createSection(
      "\uAC80\uC0C9 \uAC15\uD654",
      "enhancedSearch",
      viewModel.settings,
      actions2
    );
    content.append(createGamejobEnhancedSearchContent(viewModel, actions2));
    return details;
  }

  // src/ui/simple-mode-controls.js
  function createAutomationToggle(viewModel, actions2, key, label, title) {
    const active = Boolean(viewModel.settings?.[key]);
    const button = makeButton(
      label,
      active ? "hy-primary hy-simple-automation-toggle" : "hy-secondary hy-simple-automation-toggle",
      () => actions2.onSettingsChange({ [key]: !active }),
      title
    );
    button.setAttribute("aria-pressed", String(active));
    return button;
  }
  function renderSimpleAutomationControls(viewModel, actions2) {
    const card = make(
      "section",
      "hy-gamejob-simple-card hy-simple-automation-card"
    );
    card.append(
      make("h2", "hy-gamejob-simple-card-title", "\uC790\uB3D9 \uD638\uCD9C"),
      (() => {
        const controls = make("div", "hy-simple-automation-controls");
        controls.append(
          createAutomationToggle(
            viewModel,
            actions2,
            "autoCompanyInfo",
            "\uC790\uB3D9 \uD68C\uC0AC\uC815\uBCF4",
            "\uACF5\uACE0\uB97C \uC5F4 \uB54C \uD68C\uC0AC\uC815\uBCF4\uB97C \uC790\uB3D9\uC73C\uB85C \uBD88\uB7EC\uC635\uB2C8\uB2E4."
          ),
          createAutomationToggle(
            viewModel,
            actions2,
            "autoPastPostings",
            "\uC790\uB3D9 \uACF5\uACE0 \uD638\uCD9C",
            "\uACF5\uACE0\uB97C \uC5F4 \uB54C \uACFC\uAC70 \uACF5\uACE0 \uCCAB \uD398\uC774\uC9C0\uB97C \uC790\uB3D9\uC73C\uB85C \uBD88\uB7EC\uC635\uB2C8\uB2E4."
          )
        );
        return controls;
      })()
    );
    return card;
  }

  // src/ui/gamejob-simple-mode.js
  function createSimpleCard(title, className = "") {
    const card = make("section", `hy-gamejob-simple-card ${className}`.trim());
    const heading = make("h2", "hy-gamejob-simple-card-title", title);
    card.append(heading);
    return { card, heading };
  }
  function renderPensionCard(viewModel) {
    const result = findBoundPensionResult(viewModel);
    if (!result?.latest) return null;
    const { card, heading } = createSimpleCard(
      "\uAD6D\uBBFC\uC5F0\uAE08",
      "hy-gamejob-simple-pension"
    );
    heading.append(
      make("span", "hy-gamejob-simple-month", `${result.latest.month} \uAE30\uC900`)
    );
    const metrics = make("div", "hy-gamejob-simple-metrics");
    for (const [label, value] of [
      ["\uAC00\uC785\uC790 \uC218", result.latest.subscribers],
      [PENSION_ACQUISITION_LABEL, result.latest.joined],
      [PENSION_LOSS_LABEL, result.latest.left]
    ]) {
      const metric = make("div", "hy-gamejob-simple-metric");
      metric.append(
        make("span", "", label),
        make(
          "strong",
          "",
          Number.isFinite(value) ? `${formatNumber(value)}\uBA85` : "\u2014"
        )
      );
      metrics.append(metric);
    }
    card.append(
      metrics,
      make(
        "p",
        "hy-gamejob-simple-pension-warning",
        `${PENSION_ACQUISITION_WARNING} ${PENSION_LOSS_WARNING}`
      )
    );
    return card;
  }
  function formatUpdatedAt(value) {
    const date = new Date(value ?? "");
    if (Number.isNaN(date.getTime())) return "\uD655\uC778 \uBD88\uAC00";
    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function renderPostingCountCard(viewModel, actions2) {
    const summary = resolveGamejobPostingCountSummary({
      cachedInformation: viewModel.companyData?.gamejobListInformation,
      recruitments: viewModel.pastRecruitments,
      companyInformation: viewModel.recruitmentCompanyInfo
    });
    const { card } = createSimpleCard(
      "\uCC44\uC6A9 \uACF5\uACE0",
      "hy-gamejob-simple-posting-counts"
    );
    const total = make("div", "hy-gamejob-simple-total");
    total.append(
      make("span", "", "\uC804\uCCB4 \uACF5\uACE0 \uC218"),
      make(
        "strong",
        "",
        Number.isFinite(summary.total) ? `${formatNumber(summary.total)}\uAC74` : "\uD655\uC778 \uC804"
      )
    );
    card.append(total);
    const loading = Boolean(viewModel.gamejobSimpleUi?.loadingPostingCounts);
    if (!summary.hasDetails) {
      const detailButton = makeButton(
        loading ? "\uD655\uC778 \uC911\u2026" : "\uC0C1\uC138\uBCF4\uAE30",
        "hy-secondary hy-gamejob-simple-detail-button",
        () => actions2.onLoadGamejobSimplePostingCounts(),
        "\uAC8C\uC784\uC7A1 \uCC44\uC6A9\uC815\uBCF4 \uD0ED\uC744 \uD55C \uBC88 \uC694\uCCAD\uD574 \uCC44\uC6A9\uC911\xB7\uB9C8\uAC10 \uACF5\uACE0 \uC218\uB9CC \uD655\uC778\uD569\uB2C8\uB2E4."
      );
      detailButton.disabled = loading || !viewModel.company;
      card.append(detailButton);
      return card;
    }
    const details = make("div", "hy-gamejob-simple-count-details");
    const metrics = make(
      "div",
      "hy-gamejob-simple-metrics hy-gamejob-simple-count-metrics"
    );
    for (const [label, value] of [
      ["\uCC44\uC6A9\uC911", summary.open],
      ["\uB9C8\uAC10", summary.closed]
    ]) {
      const metric = make("div", "hy-gamejob-simple-metric");
      metric.append(
        make("span", "", label),
        make(
          "strong",
          "",
          Number.isFinite(value) ? `${formatNumber(value)}\uAC74` : "\u2014"
        )
      );
      metrics.append(metric);
    }
    details.append(metrics);
    if (summary.hasDetails) {
      const stale = isGamejobPostingCountUpdateRecommended(summary.updatedAt);
      details.append(
        make(
          "p",
          stale ? "hy-gamejob-simple-updated-at hy-stale" : "hy-gamejob-simple-updated-at",
          stale ? `\uC5C5\uB370\uC774\uD2B8 \uAD8C\uC7A5 \xB7 ${formatUpdatedAt(summary.updatedAt)} \uAE30\uC900` : `\uC5C5\uB370\uC774\uD2B8 ${formatUpdatedAt(summary.updatedAt)}`
        )
      );
      if (stale) {
        const refreshButton = makeButton(
          "\uACF5\uACE0 \uC218 \uC5C5\uB370\uC774\uD2B8",
          "hy-primary hy-gamejob-simple-refresh-button",
          () => actions2.onRefreshGamejobSimplePostingCounts()
        );
        refreshButton.disabled = loading;
        details.append(refreshButton);
      }
    }
    card.append(details);
    return card;
  }
  function renderHiddenPostingCountCard(viewModel) {
    if (!viewModel.gamejobListMode) return null;
    const { card } = createSimpleCard(
      "\uAC80\uC0C9 \uC228\uAE40",
      "hy-gamejob-simple-hidden-count"
    );
    const total = make("div", "hy-gamejob-simple-total");
    total.append(
      make("span", "", "\uD604\uC7AC \uC228\uAE30\uAE30 \uC911\uC778 \uACF5\uACE0"),
      make(
        "strong",
        "",
        `${formatNumber(viewModel.hiddenPostingCount ?? 0)}\uAC74`
      )
    );
    card.append(total);
    return card;
  }
  function renderGamejobSimpleMode(viewModel, actions2) {
    const dashboard = make("main", "hy-gamejob-simple-dashboard");
    dashboard.dataset.section = "gamejobSimple";
    const hiddenPostingCountCard = renderHiddenPostingCountCard(viewModel);
    if (hiddenPostingCountCard) dashboard.append(hiddenPostingCountCard);
    if (!viewModel.company) {
      const { card: postingCard2 } = createSimpleCard(
        "\uACF5\uACE0",
        "hy-gamejob-simple-postings"
      );
      postingCard2.append(
        make(
          "p",
          "hy-gamejob-simple-page-guide",
          "\uAC8C\uC784\uC7A1 \uACF5\uACE0 \uB610\uB294 \uAE30\uC5C5\uC815\uBCF4 \uD398\uC774\uC9C0\uB97C \uC5F4\uBA74 \uAC04\uD3B8 \uC815\uBCF4\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4."
        )
      );
      dashboard.append(postingCard2);
      return dashboard;
    }
    dashboard.append(renderSimpleAutomationControls(viewModel, actions2));
    const pensionCard = renderPensionCard(viewModel);
    if (pensionCard) dashboard.append(pensionCard);
    dashboard.append(renderPostingCountCard(viewModel, actions2));
    const { card: postingCard } = createSimpleCard(
      "\uACF5\uACE0",
      "hy-gamejob-simple-postings"
    );
    postingCard.append(createPastPostingsContent(viewModel, actions2));
    dashboard.append(postingCard);
    return dashboard;
  }

  // src/ui/jobkorea-simple-mode.js
  function createSimpleCard2(title, className = "") {
    const card = make(
      "section",
      `hy-gamejob-simple-card hy-jobkorea-simple-card ${className}`.trim()
    );
    card.append(make("h2", "hy-gamejob-simple-card-title", title));
    return card;
  }
  function getCurrentJobkoreaDuplicateStatus(viewModel) {
    const posting = viewModel.posting;
    if (!posting?.title) {
      return { duplicateCount: null, matchingCount: null, complete: false };
    }
    const titleKey = normalizePostingTitle(posting.title);
    const matchingIds = new Set(
      (viewModel.pastRecruitments?.postings ?? []).filter((item) => normalizePostingTitle(item.title) === titleKey).map((item) => item.id)
    );
    if (posting.id) matchingIds.add(posting.id);
    return {
      duplicateCount: Math.max(0, matchingIds.size - 1),
      matchingCount: matchingIds.size,
      complete: viewModel.pastRecruitments?.hasMore === false
    };
  }
  function createComparisonRow(label, value, maximum, color) {
    const row = make("div", "hy-jobkorea-comparison-row");
    const heading = make("div", "hy-jobkorea-comparison-heading");
    heading.append(
      make("span", "", label),
      make(
        "strong",
        "",
        Number.isFinite(value) ? formatNumber(value) : "\uD655\uC778 \uBD88\uAC00"
      )
    );
    const track = make("div", "hy-jobkorea-comparison-track");
    const bar = make("i", "hy-jobkorea-comparison-bar");
    bar.style.backgroundColor = color;
    bar.style.width = Number.isFinite(value) && maximum > 0 ? `${Math.max(3, value / maximum * 100)}%` : "0";
    track.append(bar);
    row.append(heading, track);
    return row;
  }
  function renderCompanyInformation(viewModel, actions2) {
    const card = createSimpleCard2(
      "\uCD5C\uADFC 3\uB144 \uACF5\uACE0 \xB7 \uC9C1\uC6D0 \uBE44\uAD50",
      "hy-jobkorea-simple-company"
    );
    const information = viewModel.recruitmentCompanyInfo;
    if (!information?.informationLoaded) {
      const button = makeButton(
        viewModel.loadingRecruitmentCompanyInfo ? "\uBD88\uB7EC\uC624\uB294 \uC911\u2026" : "\uD68C\uC0AC\uC815\uBCF4 \uBD88\uB7EC\uC624\uAE30",
        "hy-primary hy-jobkorea-simple-load",
        () => actions2.onLoadRecruitmentCompanyInfo()
      );
      button.disabled = viewModel.loadingRecruitmentCompanyInfo;
      card.append(button);
      return card;
    }
    const postingCount = information.employmentHistory?.totalCount;
    const employeeCount = information.employeeCount;
    const maximum = Math.max(
      Number.isFinite(postingCount) ? postingCount : 0,
      Number.isFinite(employeeCount) ? employeeCount : 0
    );
    const chart = make("div", "hy-jobkorea-comparison-chart");
    chart.append(
      createComparisonRow("\uCD5C\uADFC 3\uB144 \uACF5\uACE0", postingCount, maximum, "#ff786f"),
      createComparisonRow(
        "\uC7A1\uCF54\uB9AC\uC544 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218",
        employeeCount,
        maximum,
        "#4f8df7"
      )
    );
    card.append(chart);
    return card;
  }
  function renderDuplicateCount(viewModel, actions2) {
    const status = getCurrentJobkoreaDuplicateStatus(viewModel);
    const card = createSimpleCard2("\uC911\uBCF5 \uACF5\uACE0", "hy-jobkorea-simple-duplicates");
    const total = make("div", "hy-gamejob-simple-total");
    total.append(
      make(
        "span",
        "",
        status.complete ? "\uB3D9\uC77C \uC81C\uBAA9 \uC911\uBCF5" : "\uD604\uC7AC\uAE4C\uC9C0 \uD655\uC778\uB41C \uC911\uBCF5"
      ),
      make(
        "strong",
        "",
        Number.isFinite(status.duplicateCount) ? `${formatNumber(status.duplicateCount)}\uAC74` : "\u2014"
      )
    );
    card.append(total);
    if (!status.complete) {
      const warning = make("div", "hy-jobkorea-duplicate-warning");
      const loadButton = makeButton(
        viewModel.loadingPastPostings ? "\uD655\uC778 \uC911\u2026" : "\uB2E4\uC74C 30\uAC1C \uD655\uC778",
        "hy-secondary hy-jobkorea-simple-load",
        () => actions2.onLoadNextRecruitmentPage()
      );
      loadButton.disabled = viewModel.loadingPastPostings;
      warning.append(
        make(
          "p",
          "",
          "\uBAA8\uB4E0 \uACF5\uACE0\uB97C \uD655\uC778\uD574\uC57C \uC815\uD655\uD55C \uC911\uBCF5 \uC218\uB97C \uACC4\uC0B0\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
        ),
        loadButton
      );
      card.append(warning);
    }
    return card;
  }
  function renderJobkoreaSimpleMode(viewModel, actions2) {
    const dashboard = make(
      "main",
      "hy-gamejob-simple-dashboard hy-jobkorea-simple-dashboard"
    );
    dashboard.dataset.section = "jobkoreaSimple";
    if (!viewModel.company) {
      const card = createSimpleCard2("\uC7A1\uCF54\uB9AC\uC544");
      card.append(
        make(
          "p",
          "hy-gamejob-simple-page-guide",
          "\uC7A1\uCF54\uB9AC\uC544 \uACF5\uACE0 \uB610\uB294 \uAE30\uC5C5\uC815\uBCF4 \uD398\uC774\uC9C0\uB97C \uC5F4\uBA74 \uAC04\uD3B8 \uC815\uBCF4\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4."
        )
      );
      dashboard.append(card);
      return dashboard;
    }
    dashboard.append(renderSimpleAutomationControls(viewModel, actions2));
    dashboard.append(renderCompanyInformation(viewModel, actions2));
    if (viewModel.posting) {
      const duplicateCard = renderDuplicateCount(viewModel, actions2);
      dashboard.append(duplicateCard);
    }
    return dashboard;
  }

  // src/ui/sections.js
  function createPanelSections(viewModel, actions2) {
    if (viewModel.site?.id === "gamejob" && viewModel.settings.simpleMode) {
      return /* @__PURE__ */ new Map([
        ["gamejobSimple", renderGamejobSimpleMode(viewModel, actions2)]
      ]);
    }
    if (viewModel.site?.id === "jobkorea" && viewModel.settings.simpleMode) {
      return /* @__PURE__ */ new Map([
        ["jobkoreaSimple", renderJobkoreaSimpleMode(viewModel, actions2)]
      ]);
    }
    const sections = new Map([
      ...viewModel.site?.id === "jobkorea" ? [["companyInfo", renderRecruitmentCompanyInfo(viewModel, actions2)]] : [],
      ...viewModel.site?.id === "gamejob" && viewModel.company ? [["postingDetails", renderGamejobGeneral(viewModel, actions2)]] : [],
      ["pastPostings", renderPastPostings(viewModel, actions2)],
      ["workforce", renderWorkforce(viewModel, actions2)],
      ["pensionData", renderPensionData(viewModel, actions2)],
      ...viewModel.gamejobListMode ? [["enhancedSearch", renderGamejobEnhancedSearch(viewModel, actions2)]] : []
    ]);
    for (const key of [...sections.keys()]) {
      if (viewModel.settings.sectionVisibility?.[key] === false) {
        sections.delete(key);
      }
    }
    return sections;
  }

  // src/ui/posting-alert.js
  function splitPostingAlertText(value) {
    return String(value ?? "").split(/([+-]?\d[\d,]*(?:\.\d+)?)/g).filter(Boolean).map((text) => ({
      text,
      numeric: /^[+-]?\d[\d,]*(?:\.\d+)?$/.test(text)
    }));
  }
  function renderPostingAlert(viewModel) {
    const alert = viewModel.postingAlert;
    if (!alert) return null;
    const banner = make("aside", "hy-posting-alert hy-posting-alert-safe");
    const text = make("span", "hy-posting-alert-text");
    for (const part of splitPostingAlertText(alert.text)) {
      text.append(
        part.numeric ? make("strong", "hy-posting-alert-number", part.text) : document.createTextNode(part.text)
      );
    }
    banner.setAttribute("role", "status");
    banner.append(
      make("strong", "hy-posting-alert-label", "\uC54C\uB9BC"),
      text
    );
    return banner;
  }

  // src/ui/panel.js
  var ROOT_ID = "hy-root";
  var EMPTY_STATE_IMAGE_PATHS = Object.freeze(
    Array.from(
      { length: 5 },
      (_, index) => `assets/empty-state/empty-${index + 1}.png`
    )
  );
  var root;
  var panel;
  var collapsedTrigger;
  var body;
  var postingAlertHost;
  var updateNoticeHost;
  var optionsButton;
  var optionsHost;
  var systemMessageHost;
  var embedPanelButton;
  var restoreFloatingButton;
  var simpleModeButton;
  var headerPrimaryStat;
  var headerCompanyLink;
  var currentActions;
  var positionLocked = false;
  var embedMount = null;
  var embedHost = null;
  var emptyStateSwapTimer = null;
  var systemMessageDismissTimer = null;
  var systemMessageFadeTimer = null;
  var systemMessageKey = "";
  var NOTICE_DISPLAY_MS = 3600;
  var ERROR_DISPLAY_MS = 8e3;
  function extensionAssetUrl(path) {
    return globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(getExtensionAssetPath(path)) : path;
  }
  function clearEmptyStateSwapTimer() {
    if (emptyStateSwapTimer === null) return;
    clearTimeout(emptyStateSwapTimer);
    emptyStateSwapTimer = null;
  }
  function clearSystemMessageTimers() {
    clearTimeout(systemMessageDismissTimer);
    clearTimeout(systemMessageFadeTimer);
    systemMessageDismissTimer = null;
    systemMessageFadeTimer = null;
  }
  function dismissSystemMessages(actions2) {
    if (!systemMessageHost || systemMessageHost.hidden) return;
    systemMessageHost.classList.add("hy-system-message-host-leaving");
    systemMessageFadeTimer = setTimeout(() => {
      actions2.onDismissSystemMessages();
    }, 180);
  }
  function renderSystemMessages(viewModel, actions2) {
    const nextKey = JSON.stringify([
      viewModel.error ?? null,
      viewModel.notice ?? null,
      Boolean(viewModel.runtimeConnectionLost)
    ]);
    if (!viewModel.error && !viewModel.notice) {
      clearSystemMessageTimers();
      systemMessageKey = "";
      systemMessageHost.hidden = true;
      systemMessageHost.classList.remove("hy-system-message-host-leaving");
      systemMessageHost.replaceChildren();
      return;
    }
    if (nextKey === systemMessageKey) return;
    clearSystemMessageTimers();
    systemMessageKey = nextKey;
    systemMessageHost.hidden = false;
    systemMessageHost.classList.remove("hy-system-message-host-leaving");
    const messages = [];
    if (viewModel.error) {
      const errorToast = make(
        "div",
        "hy-system-toast hy-system-toast-error",
        viewModel.error
      );
      if (viewModel.runtimeConnectionLost) {
        const recovery = make("div", "hy-runtime-recovery");
        recovery.append(
          make("code", "", "chrome://extensions/"),
          makeButton(
            "\uAD00\uB9AC \uC8FC\uC18C \uBCF5\uC0AC",
            "hy-secondary",
            () => actions2.onCopyExtensionManagementUrl()
          )
        );
        errorToast.append(recovery);
      }
      messages.push(errorToast);
    }
    if (viewModel.notice) {
      messages.push(
        make("div", "hy-system-toast hy-system-toast-success", viewModel.notice)
      );
    }
    const closeButton = makeButton(
      "\xD7",
      "hy-system-toast-close",
      () => dismissSystemMessages(actions2),
      "\uC54C\uB9BC \uB2EB\uAE30"
    );
    closeButton.setAttribute("aria-label", "\uC54C\uB9BC \uB2EB\uAE30");
    systemMessageHost.replaceChildren(...messages, closeButton);
    systemMessageDismissTimer = setTimeout(
      () => dismissSystemMessages(actions2),
      viewModel.error ? ERROR_DISPLAY_MS : NOTICE_DISPLAY_MS
    );
  }
  function createEmptyStateArt() {
    clearEmptyStateSwapTimer();
    const initialIndex = Math.floor(
      Math.random() * EMPTY_STATE_IMAGE_PATHS.length
    );
    const wrapper = make("figure", "hy-empty-state-art");
    const image = make("img", "hy-empty-state-image");
    image.src = extensionAssetUrl(EMPTY_STATE_IMAGE_PATHS[initialIndex]);
    image.alt = `Hayoung4 \uBE48 \uD654\uBA74 \uC774\uBBF8\uC9C0 ${initialIndex + 1}`;
    wrapper.append(image);
    if (initialIndex === 4) {
      emptyStateSwapTimer = setTimeout(() => {
        const replacementIndex = Math.floor(Math.random() * 4);
        image.src = extensionAssetUrl(EMPTY_STATE_IMAGE_PATHS[replacementIndex]);
        image.alt = `Hayoung4 \uBE48 \uD654\uBA74 \uC774\uBBF8\uC9C0 ${replacementIndex + 1}`;
        emptyStateSwapTimer = null;
      }, 1e3);
    }
    return wrapper;
  }
  function clearEmbedHost() {
    if (!embedHost) return;
    embedHost.classList.remove(
      "hy-gamejob-embed-host",
      "hy-gamejob-embed-host-list",
      "hy-gamejob-embed-host-posting",
      "hy-gamejob-embed-host-company"
    );
    embedMount?.remove();
    embedMount = null;
    embedHost = null;
  }
  function applyPlacement(viewModel) {
    const context = getGamejobEmbedContext(document, location.href);
    const embedded = Boolean(viewModel.settings.embedded && context);
    if (!embedded) {
      if (root.parentElement !== document.documentElement) {
        document.documentElement.append(root);
      }
      clearEmbedHost();
      panel.classList.remove(
        "hy-embedded",
        "hy-embedded-list",
        "hy-embedded-posting",
        "hy-embedded-company"
      );
      return { embedded: false, canEmbed: Boolean(context) };
    }
    if (embedHost !== context.target) {
      if (root.parentElement !== document.documentElement) {
        document.documentElement.append(root);
      }
      clearEmbedHost();
      embedHost = context.target;
      embedHost.classList.add(
        "hy-gamejob-embed-host",
        `hy-gamejob-embed-host-${context.kind}`
      );
      embedMount = document.createElement("div");
      embedMount.className = `hy-gamejob-embed-slot hy-gamejob-embed-slot-${context.kind}`;
      if (context.kind === "posting") embedHost.append(embedMount);
      else embedHost.prepend(embedMount);
    }
    if (root.parentElement !== embedMount) embedMount.append(root);
    panel.classList.toggle("hy-embedded", true);
    panel.classList.toggle("hy-embedded-list", context.kind === "list");
    panel.classList.toggle("hy-embedded-posting", context.kind === "posting");
    panel.classList.toggle("hy-embedded-company", context.kind === "company");
    return { embedded: true, canEmbed: true };
  }
  function positionExternalOptionsButton(embedded) {
    optionsButton.classList.toggle("hy-options-embedded", embedded);
    if (embedded) {
      optionsButton.style.removeProperty("left");
      optionsButton.style.removeProperty("top");
      positionExternalOptionsWindow();
      return;
    }
    const rect = panel.getBoundingClientRect();
    optionsButton.style.left = `${clamp(rect.left - 40, 4, innerWidth - 36)}px`;
    optionsButton.style.top = `${clamp(rect.bottom - 32, 4, innerHeight - 36)}px`;
    positionExternalOptionsWindow();
  }
  function positionExternalOptionsWindow() {
    if (!optionsHost || optionsHost.hidden) return;
    const panelRect = panel.getBoundingClientRect();
    const gap = 10;
    const margin = 8;
    const hostWidth = Math.min(340, Math.max(0, innerWidth - margin * 2));
    const hostHeight = Math.min(
      optionsHost.scrollHeight || 600,
      Math.max(0, innerHeight - margin * 2)
    );
    const fitsLeft = panelRect.left >= hostWidth + gap + margin;
    const fitsRight = innerWidth - panelRect.right >= hostWidth + gap + margin;
    let left;
    let top = clamp(
      panelRect.top,
      margin,
      Math.max(margin, innerHeight - hostHeight - margin)
    );
    if (fitsLeft) {
      left = panelRect.left - hostWidth - gap;
    } else if (fitsRight) {
      left = panelRect.right + gap;
    } else {
      left = clamp(
        panelRect.left,
        margin,
        Math.max(margin, innerWidth - hostWidth - margin)
      );
      const fitsBelow = innerHeight - panelRect.bottom >= hostHeight + gap + margin;
      const fitsAbove = panelRect.top >= hostHeight + gap + margin;
      if (fitsBelow) top = panelRect.bottom + gap;
      else if (fitsAbove) top = panelRect.top - hostHeight - gap;
    }
    optionsHost.style.left = `${Math.round(left)}px`;
    optionsHost.style.top = `${Math.round(top)}px`;
  }
  function updateHeader(viewModel) {
    const simpleMode = Boolean(viewModel.settings.simpleMode);
    simpleModeButton.classList.toggle("hy-active", simpleMode);
    simpleModeButton.setAttribute("aria-pressed", String(simpleMode));
    simpleModeButton.title = `\uAC04\uD3B8 \uBAA8\uB4DC ${simpleMode ? "\uCF1C\uC9D0" : "\uAEBC\uC9D0"}`;
    if (viewModel.gamejobListMode) {
      const focusMode = Boolean(viewModel.settings.gamejobFocusMode);
      const label = focusMode ? "\uAC80\uC0C9 \uC81C\uC678" : "\uC228\uAE40";
      headerPrimaryStat.textContent = `${label} ${formatNumber(viewModel.hiddenPostingCount)}\uAC1C`;
      headerPrimaryStat.title = focusMode ? `\uC9D1\uC911 \uAC80\uC0C9\uC5D0\uC11C \uC81C\uC678\uB41C \uACF5\uACE0 ${formatNumber(viewModel.hiddenPostingCount)}\uAC1C` : `\uD604\uC7AC \uAC8C\uC784\uC7A1 \uBAA9\uB85D\uC5D0\uC11C \uC228\uAE34 \uACF5\uACE0 ${formatNumber(viewModel.hiddenPostingCount)}\uAC1C`;
    } else if (viewModel.site?.id === "gamejob") {
      const employeeCount = viewModel.officialEmployeeCount;
      headerPrimaryStat.textContent = Number.isFinite(employeeCount) ? `\uC9C1\uC6D0 ${formatNumber(employeeCount)}\uBA85` : "\uC9C1\uC6D0 \u2014";
      headerPrimaryStat.title = Number.isFinite(employeeCount) ? `\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218: ${formatNumber(employeeCount)}\uBA85` : "\uD604\uC7AC \uD398\uC774\uC9C0\uC5D0\uC11C \uC9C1\uC6D0 \uC218\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
    } else {
      const applicantCount = viewModel.posting?.applicantCount;
      const applicantText = viewModel.posting?.applicantCountText === "3\uBA85 \uBBF8\uB9CC" ? "3\uBA85 \uBBF8\uB9CC" : Number.isFinite(applicantCount) ? `${formatNumber(applicantCount)}\uBA85` : "\u2014";
      headerPrimaryStat.textContent = `\uC9C0\uC6D0\uC790 ${applicantText}`;
      headerPrimaryStat.title = `\uD604\uC7AC \uACF5\uACE0 \uC9C0\uC6D0\uC790 \uC218: ${applicantText}`;
    }
    headerCompanyLink.textContent = "\uD68C\uC0AC\uC815\uBCF4 \u2197";
    if (viewModel.company?.url) {
      headerCompanyLink.href = viewModel.company.url;
      headerCompanyLink.target = "_blank";
      headerCompanyLink.rel = "noreferrer";
      headerCompanyLink.removeAttribute("aria-disabled");
      headerCompanyLink.title = `${viewModel.company.name} \uD68C\uC0AC\uC815\uBCF4 \uBC14\uB85C\uAC00\uAE30`;
    } else {
      headerCompanyLink.removeAttribute("href");
      headerCompanyLink.setAttribute("aria-disabled", "true");
      headerCompanyLink.title = "\uD604\uC7AC \uD398\uC774\uC9C0\uC5D0\uC11C \uD68C\uC0AC\uC815\uBCF4 \uC8FC\uC18C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
    }
  }
  function updatePostingAlert(viewModel) {
    const alert = renderPostingAlert(viewModel);
    postingAlertHost.hidden = !alert;
    postingAlertHost.replaceChildren(...alert ? [alert] : []);
  }
  function updateReleaseNotice(viewModel) {
    const status = viewModel.updateStatus;
    if (status?.status !== "available" || !status.releaseUrl) {
      updateNoticeHost.hidden = true;
      updateNoticeHost.replaceChildren();
      return;
    }
    const link = make(
      "a",
      "hy-update-notice-link",
      `Hayoung4 ${status.latestVersion} \uC5C5\uB370\uC774\uD2B8\uAC00 \uC788\uC2B5\uB2C8\uB2E4. GitHub \uB9B4\uB9AC\uC988 \uC5F4\uAE30 \u2197`
    );
    link.href = status.releaseUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    updateNoticeHost.hidden = false;
    updateNoticeHost.replaceChildren(link);
  }
  function applySettings(settings, viewModel) {
    const { embedded, canEmbed } = applyPlacement(viewModel);
    panel.classList.toggle("hy-collapsed", Boolean(settings.collapsed));
    panel.classList.toggle("hy-simple", Boolean(settings.simpleMode));
    panel.classList.toggle(
      "hy-gamejob-simple",
      Boolean(settings.simpleMode && viewModel.site?.id === "gamejob")
    );
    panel.classList.toggle(
      "hy-jobkorea-simple",
      Boolean(settings.simpleMode && viewModel.site?.id === "jobkorea")
    );
    panel.style.setProperty("--hy-font-scale", String(settings.fontScale ?? 1));
    root.dataset.hyTheme = normalizePanelTheme(settings.theme);
    root.dataset.hyTone = normalizePanelTone(settings.panelTone);
    const toneIntensity = normalizePanelToneIntensity(
      settings.panelToneIntensity
    );
    root.style.setProperty("--hy-tone-opacity", String(toneIntensity / 100));
    panel.hidden = false;
    embedPanelButton.hidden = embedded || !canEmbed;
    restoreFloatingButton.hidden = !embedded;
    positionLocked = Boolean(settings.positionLocked);
    panel.classList.toggle("hy-position-locked", positionLocked);
    if (embedded) {
      panel.style.removeProperty("left");
      panel.style.removeProperty("top");
      panel.style.removeProperty("right");
      panel.style.removeProperty("bottom");
      panel.style.removeProperty("width");
      panel.style.removeProperty("height");
      positionExternalOptionsButton(true);
      return;
    }
    const savedSize = normalizePanelSize(settings.size);
    if (savedSize) {
      panel.style.width = `${savedSize.width}px`;
      panel.style.height = `${savedSize.height}px`;
    } else {
      panel.style.removeProperty("width");
      panel.style.removeProperty("height");
    }
    if (settings.position) {
      const width = settings.collapsed ? 56 : Math.min(savedSize?.width ?? DEFAULT_PANEL_SIZE.width, innerWidth - 16);
      const height = settings.collapsed ? 56 : Math.min(
        savedSize?.height ?? DEFAULT_PANEL_SIZE.height,
        innerHeight - 16
      );
      panel.style.left = `${clamp(settings.position.x, 0, Math.max(0, innerWidth - width))}px`;
      panel.style.top = `${clamp(settings.position.y, 0, Math.max(0, innerHeight - height))}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
    positionExternalOptionsButton(false);
  }
  function installPanelResize(handles) {
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => {
        positionExternalOptionsButton(panel.classList.contains("hy-embedded"));
      }).observe(panel);
    }
    for (const handle of handles) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || panel.classList.contains("hy-collapsed") || panel.classList.contains("hy-embedded")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const direction = handle.dataset.direction;
        const startRect = panel.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        handle.setPointerCapture(event.pointerId);
        panel.classList.add("hy-resizing");
        const move = (moveEvent) => {
          const next = calculatePanelResize({
            direction,
            startRect,
            deltaX: moveEvent.clientX - startX,
            deltaY: moveEvent.clientY - startY,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            minWidth: MIN_PANEL_SIZE.width,
            minHeight: MIN_PANEL_SIZE.height
          });
          panel.style.left = `${next.x}px`;
          panel.style.top = `${next.y}px`;
          panel.style.right = "auto";
          panel.style.bottom = "auto";
          panel.style.width = `${next.width}px`;
          panel.style.height = `${next.height}px`;
          positionExternalOptionsButton(false);
        };
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          panel.classList.remove("hy-resizing");
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", finish);
          handle.removeEventListener("pointercancel", finish);
          const rect = panel.getBoundingClientRect();
          const size = normalizePanelSize({
            width: rect.width,
            height: rect.height
          });
          if (!size) return;
          currentActions?.onSettingsChange(
            {
              size,
              position: {
                x: Math.round(rect.left),
                y: Math.round(rect.top)
              }
            },
            false
          );
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", finish, { once: true });
        handle.addEventListener("pointercancel", finish, { once: true });
      });
    }
  }
  function installCollapsedDrag(trigger) {
    trigger.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (positionLocked || panel.classList.contains("hy-embedded")) {
        currentActions?.onToggleCollapsed();
        return;
      }
      const bounds = panel.getBoundingClientRect();
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;
      const originX = event.clientX;
      const originY = event.clientY;
      let moved = false;
      trigger.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        if (Math.abs(moveEvent.clientX - originX) > 4 || Math.abs(moveEvent.clientY - originY) > 4) {
          moved = true;
        }
        panel.style.left = `${clamp(moveEvent.clientX - offsetX, 0, innerWidth - 56)}px`;
        panel.style.top = `${clamp(moveEvent.clientY - offsetY, 0, innerHeight - 56)}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        positionExternalOptionsButton(false);
      };
      const finish = () => {
        trigger.removeEventListener("pointermove", move);
        const rect = panel.getBoundingClientRect();
        if (moved) {
          currentActions?.onSettingsChange(
            { position: { x: Math.round(rect.left), y: Math.round(rect.top) } },
            false
          );
        } else {
          currentActions?.onToggleCollapsed();
        }
      };
      trigger.addEventListener("pointermove", move);
      trigger.addEventListener("pointerup", finish, { once: true });
      trigger.addEventListener("pointercancel", finish, { once: true });
    });
  }
  function installPanelDrag(header) {
    header.addEventListener("pointerdown", (event) => {
      if (positionLocked || panel.classList.contains("hy-embedded") || event.button !== 0 || event.target.closest("button, a, input, select, .hy-help-mark")) {
        return;
      }
      const bounds = panel.getBoundingClientRect();
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;
      header.setPointerCapture(event.pointerId);
      panel.classList.add("hy-dragging");
      const move = (moveEvent) => {
        panel.style.left = `${clamp(moveEvent.clientX - offsetX, 0, innerWidth - 80)}px`;
        panel.style.top = `${clamp(moveEvent.clientY - offsetY, 0, innerHeight - 48)}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        positionExternalOptionsButton(false);
      };
      const finish = () => {
        panel.classList.remove("hy-dragging");
        header.removeEventListener("pointermove", move);
        const rect = panel.getBoundingClientRect();
        currentActions?.onSettingsChange(
          { position: { x: Math.round(rect.left), y: Math.round(rect.top) } },
          false
        );
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", finish, { once: true });
      header.addEventListener("pointercancel", finish, { once: true });
    });
  }
  function installSectionReorder(container) {
    let draggedSection = null;
    container.addEventListener("dragstart", (event) => {
      if (event.target.closest("button, a, input, .hy-help-mark")) {
        event.preventDefault();
        return;
      }
      const title = event.target.closest(".hy-section-title");
      if (!title) return;
      draggedSection = title.closest(".hy-section");
      draggedSection.classList.add("hy-section-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedSection.dataset.section);
    });
    container.addEventListener("dragover", (event) => {
      if (!draggedSection) return;
      const target = event.target.closest(".hy-section");
      if (!target || target === draggedSection) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const bounds = target.getBoundingClientRect();
      const insertBefore = event.clientY < bounds.top + bounds.height / 2;
      container.insertBefore(
        draggedSection,
        insertBefore ? target : target.nextSibling
      );
    });
    const finish = () => {
      if (!draggedSection) return;
      draggedSection.classList.remove("hy-section-dragging");
      draggedSection = null;
      const order = [...container.querySelectorAll(":scope > .hy-section")].map((section) => section.dataset.section).filter(Boolean);
      currentActions?.onReorderSections(order);
    };
    container.addEventListener("drop", (event) => {
      if (!draggedSection) return;
      event.preventDefault();
      finish();
    });
    container.addEventListener("dragend", finish);
  }
  function ensurePanel(actions2) {
    currentActions = actions2;
    root = document.getElementById(ROOT_ID);
    if (root) return;
    root = make("div");
    root.id = ROOT_ID;
    panel = make("aside", "hy-panel");
    panel.setAttribute("aria-label", "Hayoung4 \uD68C\uC0AC \uC815\uBCF4 \uD328\uB110");
    collapsedTrigger = make("button", "hy-collapsed-trigger", "H3");
    collapsedTrigger.type = "button";
    collapsedTrigger.title = "Hayoung4 \uD3BC\uCE58\uAE30 \xB7 \uB4DC\uB798\uADF8\uD558\uC5EC \uC774\uB3D9";
    const header = make("header", "hy-header");
    const headerDragZone = make("div", "hy-header-drag-zone");
    headerDragZone.setAttribute("aria-hidden", "true");
    const brand = make("div", "hy-brand");
    brand.append(
      make("span", "hy-brand-mark", "H3"),
      createHelpMark(
        "\uC7A1\uCF54\uB9AC\uC544\xB7\uAC8C\uC784\uC7A1 \uACF5\uACE0\uC640 \uD68C\uC0AC\xB7\uAD6D\uBBFC\uC5F0\uAE08 \uC815\uBCF4\uB97C \uD55C \uD654\uBA74\uC5D0\uC11C \uD655\uC778\uD569\uB2C8\uB2E4.",
        "hy-header-help"
      )
    );
    const quickInfo = make("div", "hy-header-quick-info");
    headerPrimaryStat = make("span", "hy-header-primary-stat", "\uC9C0\uC6D0\uC790 \u2014");
    headerCompanyLink = make("a", "hy-header-company-link", "\uD68C\uC0AC\uC815\uBCF4 \u2197");
    quickInfo.append(headerPrimaryStat, headerCompanyLink);
    simpleModeButton = makeButton(
      "\uAC04\uD3B8 \uBAA8\uB4DC",
      "hy-header-mode-toggle",
      () => currentActions.onToggleSimpleMode(),
      "\uAC04\uD3B8 \uBAA8\uB4DC \uCF1C\uAE30/\uB044\uAE30"
    );
    simpleModeButton.setAttribute("aria-pressed", "false");
    const controls = make("div", "hy-header-controls");
    embedPanelButton = makeButton(
      "\u21F2",
      "hy-icon-button",
      () => currentActions.onEmbedPanel(),
      "\uD398\uC774\uC9C0 \uC6B0\uCE21 \uC601\uC5ED\uC5D0 \uB0B4\uC7A5"
    );
    restoreFloatingButton = makeButton(
      "\u21F1",
      "hy-icon-button",
      () => currentActions.onRestoreFloating(),
      "\uD50C\uB85C\uD305 \uCC3D\uC73C\uB85C \uAEBC\uB0B4\uAE30"
    );
    controls.append(
      embedPanelButton,
      restoreFloatingButton,
      makeButton(
        "\u21BB",
        "hy-icon-button",
        () => currentActions.onRefresh(),
        "\uC0C8\uB85C\uACE0\uCE68"
      ),
      makeButton(
        "\u2014",
        "hy-icon-button",
        () => currentActions.onToggleCollapsed(),
        "\uC811\uAE30/\uD3BC\uCE58\uAE30"
      )
    );
    header.append(brand, quickInfo, simpleModeButton, controls, headerDragZone);
    postingAlertHost = make("div", "hy-posting-alert-host");
    postingAlertHost.hidden = true;
    updateNoticeHost = make("div", "hy-update-notice-host");
    updateNoticeHost.hidden = true;
    body = make("div", "hy-body");
    optionsButton = makeButton(
      "\u2699",
      "hy-options-launcher",
      () => currentActions.onToggleOptions(),
      "\uC635\uC158 \uC5F4\uAE30/\uB2EB\uAE30"
    );
    optionsButton.setAttribute("aria-label", "\uC635\uC158 \uC5F4\uAE30/\uB2EB\uAE30");
    optionsHost = make("div", "hy-options-host");
    optionsHost.hidden = true;
    systemMessageHost = make("div", "hy-system-message-host");
    systemMessageHost.hidden = true;
    systemMessageHost.setAttribute("role", "status");
    systemMessageHost.setAttribute("aria-live", "polite");
    const resizeHandles = PANEL_RESIZE_DIRECTIONS.map((direction) => {
      const handle = make("div", "hy-panel-resize-handle");
      handle.dataset.direction = direction;
      handle.setAttribute("aria-hidden", "true");
      return handle;
    });
    panel.append(
      collapsedTrigger,
      header,
      postingAlertHost,
      updateNoticeHost,
      body,
      ...resizeHandles
    );
    root.append(panel, optionsHost, optionsButton, systemMessageHost);
    document.documentElement.append(root);
    installPanelDrag(header);
    installPanelResize(resizeHandles);
    installCollapsedDrag(collapsedTrigger);
    installSectionReorder(body);
    addEventListener(
      "resize",
      () => positionExternalOptionsButton(panel.classList.contains("hy-embedded"))
    );
  }
  function replaceBodyChildren(...children) {
    const scrollTop = body.scrollTop;
    body.replaceChildren(...children);
    queueMicrotask(() => {
      if (body?.isConnected) body.scrollTop = scrollTop;
    });
  }
  function renderPanel(viewModel, actions2) {
    ensurePanel(actions2);
    currentActions = actions2;
    root.hidden = !viewModel.panelVisible;
    if (!viewModel.panelVisible) {
      clearEmptyStateSwapTimer();
      return;
    }
    applySettings(viewModel.settings, viewModel);
    updateHeader(viewModel);
    updatePostingAlert(viewModel);
    updateReleaseNotice(viewModel);
    optionsButton.classList.toggle("hy-active", Boolean(viewModel.optionsOpen));
    optionsButton.setAttribute(
      "aria-pressed",
      String(Boolean(viewModel.optionsOpen))
    );
    optionsHost.hidden = !viewModel.optionsOpen;
    if (viewModel.optionsOpen) {
      optionsHost.replaceChildren(createOptionsWindow(viewModel, actions2));
      queueMicrotask(positionExternalOptionsWindow);
    } else {
      optionsHost.replaceChildren();
    }
    renderSystemMessages(viewModel, actions2);
    const sections = createPanelSections(viewModel, actions2);
    const order = resolveVisibleSectionOrder(
      sections.keys(),
      viewModel.settings.sectionOrder
    );
    const visibleSections = order.map((key) => sections.get(key)).filter(Boolean);
    if (visibleSections.length === 0) {
      replaceBodyChildren(createEmptyStateArt());
      return;
    }
    clearEmptyStateSwapTimer();
    replaceBodyChildren(...visibleSections);
  }

  // src/app-state.js
  function createPensionPoolSummary() {
    return {
      companyCount: 0,
      locationCount: 0,
      snapshotCount: 0,
      months: [],
      installedSourceMonths: [],
      latestInstalledSourceMonth: null,
      latestMonth: null,
      oldestMonth: null,
      updatedAt: null
    };
  }
  function updatePastPostingQuery(current, query) {
    return {
      ...current ?? {},
      query: String(query ?? "").trim()
    };
  }
  function createInitialAppState({
    currentUrl = globalThis.location?.href ?? "",
    currentYear = (/* @__PURE__ */ new Date()).getFullYear()
  } = {}) {
    return {
      site: null,
      company: null,
      posting: null,
      employeeCount: null,
      data: null,
      companyData: null,
      candidates: [],
      loading: false,
      error: null,
      notice: null,
      runtimeConnectionLost: false,
      optionsOpen: false,
      hiddenGamejobPostingCount: 0,
      loadingGamejobCompanyKeys: /* @__PURE__ */ new Set(),
      workforceDirectory: createInMemoryWorkforceDirectory(),
      pensionPoolSummary: createPensionPoolSummary(),
      pensionPoolUi: {
        companyId: null,
        query: "",
        searched: false,
        results: []
      },
      pensionPortalUi: {
        year: currentYear,
        loadedYear: null,
        loading: false,
        files: []
      },
      pensionActivity: { busy: false, label: null },
      updateStatus: {
        status: "checking",
        currentVersion: "1.0.0",
        latestVersion: null,
        releaseUrl: null,
        checkedAt: null
      },
      refreshId: 0,
      lastUrl: currentUrl,
      pastPostingUi: {
        companyId: null,
        query: "",
        duplicateOnly: false,
        selectedPostingId: null,
        scrollTop: 0
      },
      gamejobSimpleUi: {
        companyId: null,
        loadingPostingCounts: false
      },
      collection: {
        status: "idle",
        data: null,
        error: null,
        lastMessage: null,
        loadingCompany: false,
        loadingPostings: false
      }
    };
  }

  // src/browser-bridge.js
  var RUNTIME_CONNECTION_ERROR_PATTERNS = [
    /message channel closed/i,
    /asynchronous response/i,
    /receiving end does not exist/i,
    /could not establish connection/i,
    /extension context invalidated/i
  ];
  function pickTextFiles(accept, multiple = false) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      input.addEventListener(
        "change",
        () => resolve(input.files ? [...input.files] : []),
        { once: true }
      );
      input.click();
    });
  }
  async function pickTextFile(accept) {
    return (await pickTextFiles(accept, false))[0] ?? null;
  }
  function isRuntimeConnectionError(error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return RUNTIME_CONNECTION_ERROR_PATTERNS.some(
      (pattern) => pattern.test(message)
    );
  }
  function createRuntimeMessenger({ onConnectionLost } = {}) {
    const normalizeError = (error) => {
      if (!isRuntimeConnectionError(error)) return error;
      onConnectionLost?.();
      return new Error(
        "\uD655\uC7A5 \uD504\uB85C\uADF8\uB7A8 \uC124\uCE58\xB7\uC5C5\uB370\uC774\uD2B8 \uD6C4 \uC5F0\uACB0\uC774 \uB04A\uACBC\uC2B5\uB2C8\uB2E4. Hayoung4 \uD655\uC7A5 \uC544\uC774\uCF58\uC5D0\uC11C \u2018\uCF58\uD150\uCE20 \uC2A4\uD06C\uB9BD\uD2B8 \uB2E4\uC2DC \uB4F1\uB85D\u2019\uC744 \uB204\uB978 \uB4A4 \uD604\uC7AC \uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68\uD558\uC138\uC694."
      );
    };
    return function sendRuntimeMessage2(message) {
      return new Promise((resolve, reject) => {
        if (!globalThis.chrome?.runtime?.sendMessage) {
          reject(
            normalizeError(
              new Error("Extension context invalidated: runtime unavailable")
            )
          );
          return;
        }
        try {
          chrome.runtime.sendMessage(message, (response) => {
            const error = chrome.runtime.lastError;
            if (error) reject(normalizeError(new Error(error.message)));
            else resolve(response);
          });
        } catch (error) {
          reject(normalizeError(error));
        }
      });
    };
  }

  // src/app.js
  var state = createInitialAppState();
  var gamejobListBlocker = null;
  var gamejobSearchSaveQueue = Promise.resolve();
  var gamejobCompanyInformationQueue = Promise.resolve();
  var gamejobListPostingSaveQueue = Promise.resolve();
  var companyInformationLoadPromise = null;
  var sendRuntimeMessage = createRuntimeMessenger({
    onConnectionLost: () => {
      state.runtimeConnectionLost = true;
    }
  });
  async function refreshPensionSearchResults() {
    if (!state.pensionPoolUi.searched || !state.pensionPoolUi.query) return;
    const response = await sendRuntimeMessage({
      type: "hayoung:pension-search",
      criteria: createPensionSearchCriteria(state.pensionPoolUi.query),
      limit: 5
    });
    if (!response?.ok) {
      throw new Error(response?.error ?? "\uC5F0\uAE08 \uD480 \uAC80\uC0C9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
    state.pensionPoolUi.results = response.results ?? [];
    const query = state.pensionPoolUi.query;
    const exactResult = state.pensionPoolUi.results.find(
      (result) => !result.manualBind && getPensionSourceKey(query) === getPensionSourceKey(result.name)
    );
    const cached = getCachedPensionCompanyMatch(state.data, query);
    if (exactResult && !isSamePensionMatch(cached, exactResult)) {
      state.data = await cachePensionCompanyMatch(query, {
        name: exactResult.name,
        address: exactResult.matchedAddress
      });
    }
  }
  function createPensionSearchCriteria(name) {
    const query = String(name ?? "").trim();
    const currentCompanyName = state.company?.name ?? null;
    const queryTargetsCurrentCompany = Boolean(
      currentCompanyName && getPensionSourceKey(currentCompanyName) === getPensionSourceKey(query)
    );
    const manualBind = queryTargetsCurrentCompany ? getBoundPensionCompanyMatch(state.data, currentCompanyName) : !currentCompanyName ? getBoundPensionCompanyMatch(state.data, query) : null;
    const cachedMatch = getCachedPensionCompanyMatch(state.data, query);
    const preferredMatch = manualBind ?? cachedMatch;
    const directoryBindingDisabled = isPensionDirectoryBindingDisabled(
      state.data,
      queryTargetsCurrentCompany ? currentCompanyName : query
    );
    return {
      name: query,
      companyId: queryTargetsCurrentCompany ? state.company?.id : null,
      companyName: queryTargetsCurrentCompany ? currentCompanyName : null,
      // Search ranking is name-only. The address is attached solely to choose
      // the most relevant location inside the five displayed companies.
      referenceAddress: state.collection.data?.company?.address ?? state.companyData?.profile?.address ?? state.company?.address ?? null,
      preferredMatch: preferredMatch ? { name: preferredMatch.name, address: preferredMatch.address } : null,
      manualBind: Boolean(manualBind),
      allowAutomaticBinding: INTERNAL_FEATURE_FLAGS.automaticPensionBinding && !directoryBindingDisabled
    };
  }
  function resetPensionPoolUi(company) {
    const companyId = company?.id ?? null;
    if (state.pensionPoolUi.companyId === companyId) return;
    state.pensionPoolUi = {
      companyId,
      query: company?.name ?? "",
      searched: false,
      results: []
    };
  }
  async function invalidatePensionSearchCache() {
    await sendRuntimeMessage({ type: "hayoung:pension-index-invalidate" });
  }
  async function refreshUpdateStatus() {
    const response = await sendRuntimeMessage({ type: "hayoung:check-update" });
    state.updateStatus = response?.ok ? response.updateStatus : {
      status: "unavailable",
      currentVersion: chrome.runtime.getManifest().version,
      latestVersion: null,
      releaseUrl: null,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    render();
  }
  function getRequiredPensionMonthForImport() {
    const policy = state.data?.pensionPolicy;
    if (isPensionPolicyCheckDue(policy)) {
      throw new Error(
        "\uCD5C\uC2E0 \uD30C\uC77C \uD655\uC778 \uC2DC\uAC01\uC774 30\uC77C\uC744 \uC9C0\uB0AC\uC2B5\uB2C8\uB2E4. \uACF5\uACF5\uB370\uC774\uD130 \uC6D4\uBCC4 \uBAA9\uB85D\uC744 \uBA3C\uC800 \uAC31\uC2E0\uD558\uC138\uC694."
      );
    }
    if (!policy?.requiredLatestMonth) {
      throw new Error("\uACF5\uACF5\uB370\uC774\uD130 \uCD5C\uC2E0 \uC6D4\uC744 \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.");
    }
    return policy.requiredLatestMonth;
  }
  async function withPensionActivity(label, operation) {
    state.pensionActivity = { busy: true, label };
    render();
    try {
      await new Promise((resolve) => {
        if (typeof globalThis.requestAnimationFrame === "function") {
          globalThis.requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
      return await operation();
    } finally {
      state.pensionActivity = { busy: false, label: null };
      render();
    }
  }
  function createViewModel() {
    const currentEmployeeCount = state.employeeCount ?? getLatestEmployeeCount(state.companyData);
    const officialEmployeeCount = state.collection.data?.company?.employeeCount ?? state.employeeCount ?? null;
    const openPostingCount = getOpenPostingCount(state.companyData);
    const pensionPolicy = state.data.pensionPolicy;
    const viewModel = {
      panelVisible: isHayoungPanelPage(location.href),
      site: state.site,
      pageType: state.collection.data?.pageType ?? state.site?.getPageType?.(location.href) ?? null,
      company: state.company,
      posting: state.posting,
      employeeCount: currentEmployeeCount,
      companyData: state.companyData,
      candidates: state.candidates,
      loading: state.loading,
      error: state.error,
      notice: state.notice,
      runtimeConnectionLost: state.runtimeConnectionLost,
      optionsOpen: state.optionsOpen,
      settings: state.data.settings,
      schemaVersion: SCHEMA_VERSION,
      workforceRecordCount: state.workforceDirectory.recordCount,
      pensionPoolSummary: state.pensionPoolSummary,
      pensionPolicy,
      pensionPolicyStatus: {
        checkDue: isPensionPolicyCheckDue(pensionPolicy),
        latestInstalled: isRequiredPensionMonthInstalled(
          state.pensionPoolSummary,
          pensionPolicy
        )
      },
      pensionPoolUi: state.pensionPoolUi,
      pensionBindingSourceName: state.company?.name ?? state.pensionPoolUi.query ?? null,
      pensionBinding: getBoundPensionCompanyMatch(
        state.data,
        state.company?.name ?? state.pensionPoolUi.query
      ),
      pensionCachedMatch: getCachedPensionCompanyMatch(
        state.data,
        state.pensionPoolUi.query
      ),
      pensionBindingEmployeeCount: officialEmployeeCount,
      pensionPortalUi: state.pensionPortalUi,
      pensionActivity: state.pensionActivity,
      openPostingCount,
      postingRatio: calculatePostingRatio(currentEmployeeCount, openPostingCount),
      officialEmployeeCount,
      officialEmployeeSourceLabel: state.site ? `${state.site.label} \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218` : null,
      recruitmentCompanyInfo: state.collection.data?.company ?? null,
      loadingRecruitmentCompanyInfo: Boolean(state.collection.loadingCompany),
      pastRecruitments: state.collection.data?.recruitments ?? null,
      pastPostingUi: state.pastPostingUi,
      loadingPastPostings: Boolean(state.collection.loadingPostings),
      gamejobSimpleUi: state.gamejobSimpleUi,
      gamejobListMode: state.site?.id === "gamejob" && isGamejobJobListPage(location.href),
      hiddenPostingCount: state.hiddenGamejobPostingCount,
      updateStatus: state.updateStatus
    };
    viewModel.postingAlert = createPostingAlert(viewModel);
    return viewModel;
  }
  function resetPastPostingUi(companyId) {
    if (state.pastPostingUi.companyId === companyId) return;
    state.pastPostingUi = {
      companyId,
      query: "",
      duplicateOnly: false,
      selectedPostingId: null,
      scrollTop: 0
    };
  }
  function resetGamejobSimpleUi(companyId) {
    if (state.gamejobSimpleUi.companyId === companyId) return;
    state.gamejobSimpleUi = {
      companyId,
      loadingPostingCounts: false
    };
  }
  function hasCurrentGamejobPostingCountDetails() {
    const cached = state.companyData?.gamejobListInformation;
    const recruitments = state.collection.data?.recruitments;
    return Boolean(
      Number.isFinite(cached?.openPostingCount) || Number.isFinite(cached?.closedPostingCount) || Number.isFinite(recruitments?.openCount) || Number.isFinite(recruitments?.closedCount)
    );
  }
  async function loadCurrentGamejobPostingCounts() {
    const refreshId = state.refreshId;
    const site = state.site;
    const company = state.company ? { ...state.company } : null;
    const simpleCompanyId = state.gamejobSimpleUi.companyId;
    const externalId = company?.externalId ?? state.collection.data?.company?.externalId;
    if (site?.id !== "gamejob" || !externalId || !company || !site.loadListCompanyPostingCount) {
      throw new Error("\uD604\uC7AC \uAC8C\uC784\uC7A1 \uD68C\uC0AC\uC758 \uACF5\uACE0 \uC218\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    if (state.gamejobSimpleUi.loadingPostingCounts) return;
    state.gamejobSimpleUi.loadingPostingCounts = true;
    render();
    try {
      const requestCompany = {
        id: String(externalId),
        name: company.name
      };
      const information = await site.loadListCompanyPostingCount(
        requestCompany,
        location.href
      );
      if (refreshId !== state.refreshId) return;
      state.data = await saveGamejobListCompanyInformation(
        {
          ...company,
          id: `gamejob:${externalId}`,
          externalId: String(externalId)
        },
        information
      );
      updateDerivedState();
      state.notice = `${company.name}\uC758 \uCC44\uC6A9\uC911\xB7\uB9C8\uAC10 \uACF5\uACE0 \uC218\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.`;
    } finally {
      if (state.gamejobSimpleUi.companyId === simpleCompanyId) {
        state.gamejobSimpleUi.loadingPostingCounts = false;
        render();
      }
    }
  }
  function findLivePastPosting(postingId) {
    return state.collection.data?.recruitments?.postings?.find(
      (posting) => posting.id === postingId
    );
  }
  function render() {
    if (!state.data) return;
    renderPanel(createViewModel(), actions);
    syncGamejobListBlocker();
  }
  function getStoredGamejobListCompanyInformation(data) {
    const result = /* @__PURE__ */ new Map();
    for (const [storageId, storedCompany] of Object.entries(
      data.companies ?? {}
    )) {
      const information = storedCompany?.gamejobListInformation;
      if (!information) continue;
      const fallbackId = storageId.startsWith("gamejob:") ? storageId.slice("gamejob:".length) : null;
      const companyKey = getGamejobCompanyBlockKey({
        id: storedCompany.profile?.externalId ?? fallbackId,
        name: storedCompany.profile?.name
      });
      if (companyKey) result.set(companyKey, information);
    }
    return result;
  }
  function syncGamejobListBlocker() {
    const active = state.site?.id === "gamejob" && isGamejobJobListPage(location.href);
    if (!active) {
      gamejobListBlocker?.stop();
      gamejobListBlocker = null;
      state.hiddenGamejobPostingCount = 0;
      return;
    }
    if (!gamejobListBlocker) {
      gamejobListBlocker = new GamejobListBlocker(document, {
        onHidePosting: (posting) => actions.onHideGamejobPosting(posting),
        onHideCompany: (company) => actions.onHideGamejobCompany(company),
        onLoadCompanyInformation: (company) => actions.onLoadGamejobListCompanyInformation(company),
        onLoadCompanyPostingCount: (company) => actions.onLoadGamejobListCompanyPostingCount(company),
        onSavePosting: (posting) => actions.onSaveGamejobListPosting(posting),
        onHiddenCountChange: (count2) => {
          if (state.hiddenGamejobPostingCount === count2) return;
          state.hiddenGamejobPostingCount = count2;
          render();
        }
      });
    }
    const savedPostings = Object.values(state.data.companies ?? {}).flatMap(
      (company) => Object.values(company.postings ?? {}).filter((posting) => String(posting.id ?? "").startsWith("gamejob:")).map((posting) => posting.id)
    );
    gamejobListBlocker.setRules({
      postings: state.data.settings.gamejobHiddenPostings,
      savedPostings,
      companies: state.data.settings.gamejobHiddenCompanies,
      hidePhrases: state.data.settings.gamejobHidePhrases,
      hideExceptions: state.data.settings.gamejobHideExceptions,
      focusMode: state.data.settings.gamejobFocusMode,
      focusKeywords: state.data.settings.gamejobFocusKeywords,
      focusPriority: state.data.settings.gamejobFocusPriority,
      focusIgnoreHiddenCompanies: state.data.settings.gamejobFocusIgnoreHiddenCompanies,
      companyInformation: getStoredGamejobListCompanyInformation(state.data),
      loadingCompanyKeys: state.loadingGamejobCompanyKeys
    });
    gamejobListBlocker.start();
  }
  function recordCollectionProgress(message, refreshId = state.refreshId) {
    if (refreshId !== state.refreshId) return;
    state.collection.lastMessage = message;
  }
  async function delayAutomaticRequest(label, refreshId) {
    const delay = 1e3 + Math.floor(Math.random() * 501);
    recordCollectionProgress(
      `${label}: ${(delay / 1e3).toFixed(2)}\uCD08 \uD6C4 \uC694\uCCAD`,
      refreshId
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  async function loadCompanyInformation({ automatic = false } = {}) {
    const refreshId = state.refreshId;
    const site = state.site;
    if (!site?.loadCompanyInformation || !state.collection.data) return null;
    if (state.collection.data.company?.informationLoaded && state.collection.data.company?.address) {
      recordCollectionProgress("\uD68C\uC0AC\uC815\uBCF4\uB294 \uC774\uBBF8 \uBD88\uB7EC\uC628 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.", refreshId);
      return state.collection.data.company;
    }
    if (companyInformationLoadPromise) return companyInformationLoadPromise;
    companyInformationLoadPromise = (async () => {
      state.collection.loadingCompany = true;
      state.collection.status = "loading";
      state.collection.error = null;
      render();
      try {
        if (automatic) await delayAutomaticRequest("\uC790\uB3D9 \uD68C\uC0AC\uC815\uBCF4", refreshId);
        if (refreshId !== state.refreshId) return null;
        const company = await site.loadCompanyInformation(
          document,
          location.href,
          {
            onProgress: (message) => recordCollectionProgress(message, refreshId)
          }
        );
        if (refreshId !== state.refreshId) return null;
        state.collection.data = {
          ...state.collection.data,
          company: { ...state.collection.data.company, ...company }
        };
        state.employeeCount = company.employeeCount ?? state.employeeCount;
        recordCollectionProgress("\uD68C\uC0AC\uC815\uBCF4\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.", refreshId);
        if (state.company) {
          state.data = await cacheCompanyProfile({
            ...state.company,
            address: company.address ?? state.company.address
          });
          updateDerivedState();
        }
        return state.collection.data.company;
      } catch (error) {
        if (refreshId !== state.refreshId) return null;
        state.collection.status = "error";
        state.collection.error = error instanceof Error ? error.message : String(error);
        state.error = state.collection.error;
        logError(error);
        return null;
      } finally {
        if (refreshId === state.refreshId) {
          state.collection.loadingCompany = false;
          if (!state.collection.error) state.collection.status = "complete";
          render();
        }
      }
    })();
    try {
      return await companyInformationLoadPromise;
    } finally {
      companyInformationLoadPromise = null;
    }
  }
  async function loadNextRecruitmentPage({ automatic = false, scrollTop } = {}) {
    if (Number.isFinite(scrollTop)) {
      state.pastPostingUi.scrollTop = Math.max(0, scrollTop);
    }
    const refreshId = state.refreshId;
    const site = state.site;
    const recruitment = state.collection.data?.recruitments;
    if (!site?.loadRecruitmentPage || !recruitment || state.collection.loadingPostings)
      return;
    const loadedPages = recruitment.loadedPages ?? [];
    if (loadedPages.length > 0 && recruitment.hasMore === false) {
      recordCollectionProgress("\uBD88\uB7EC\uC62C \uACF5\uACE0\uAC00 \uB354 \uC5C6\uC2B5\uB2C8\uB2E4.", refreshId);
      return;
    }
    const page = loadedPages.includes(1) ? Math.max(...loadedPages) + 1 : 1;
    const maxPageCount = recruitment.maxPageCount ?? recruitment.pageCount ?? 4;
    if (page > maxPageCount) {
      recordCollectionProgress(
        `\uC548\uC804 \uC0C1\uD55C\uC778 ${maxPageCount}\uD398\uC774\uC9C0\uC5D0 \uB3C4\uB2EC\uD588\uC2B5\uB2C8\uB2E4.`,
        refreshId
      );
      return;
    }
    state.collection.loadingPostings = true;
    state.collection.status = "loading";
    state.collection.error = null;
    render();
    try {
      if (automatic) await delayAutomaticRequest("\uC790\uB3D9 \uACFC\uAC70 \uACF5\uACE0", refreshId);
      if (refreshId !== state.refreshId) return;
      const pageResult = await site.loadRecruitmentPage(
        document,
        location.href,
        page,
        {
          onProgress: (message) => recordCollectionProgress(message, refreshId)
        }
      );
      if (refreshId !== state.refreshId) return;
      state.collection.data = site.mergeRecruitmentPage(
        state.collection.data,
        pageResult
      );
      const updated = state.collection.data.recruitments;
      recordCollectionProgress(
        `${page}\uD398\uC774\uC9C0 \uC644\uB8CC: ${updated.loadedPostingCount}/${updated.totalCount ?? "?"}\uAC74`,
        refreshId
      );
    } catch (error) {
      if (refreshId !== state.refreshId) return;
      state.collection.status = "error";
      state.collection.error = error instanceof Error ? error.message : String(error);
      state.error = state.collection.error;
      logError(error);
    } finally {
      if (refreshId === state.refreshId) {
        state.collection.loadingPostings = false;
        if (!state.collection.error) state.collection.status = "complete";
        render();
      }
    }
  }
  async function initializeSiteCollection(site, refreshId = state.refreshId) {
    if (site?.id === "gamejob" && isGamejobJobListPage(location.href)) {
      state.collection = {
        status: "idle",
        data: null,
        error: null,
        lastMessage: null,
        loadingCompany: false,
        loadingPostings: false
      };
      return;
    }
    if (!site?.createCollectionData) {
      state.collection = {
        status: "idle",
        data: null,
        error: null,
        lastMessage: null,
        loadingCompany: false,
        loadingPostings: false
      };
      return;
    }
    state.collection = {
      status: "complete",
      data: site.createCollectionData(document, location.href),
      error: null,
      lastMessage: `${site.label} \uD604\uC7AC \uD398\uC774\uC9C0 \uC815\uBCF4\uB9CC \uC77D\uC5C8\uC2B5\uB2C8\uB2E4. \uC678\uBD80 \uC694\uCCAD\uC740 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.`,
      loadingCompany: false,
      loadingPostings: false
    };
    await startAutomaticPensionSearch();
    render();
    if (state.collection.data.pageType !== "posting") return;
    if (state.data.settings.autoCompanyInfo) {
      await loadCompanyInformation({ automatic: true });
    }
    if (refreshId !== state.refreshId) return;
    if (state.data.settings.autoPastPostings) {
      await loadNextRecruitmentPage({ automatic: true });
    }
  }
  async function startAutomaticPensionSearch() {
    const companyName = String(state.company?.name ?? "").trim();
    if (!companyName) return;
    state.pensionPoolUi.query = companyName;
    state.pensionPoolUi.searched = true;
    await refreshPensionSearchResults();
  }
  function updateDerivedState() {
    state.workforceDirectory = createInMemoryWorkforceDirectory(
      state.data?.workforceRecords
    );
    state.companyData = state.company ? state.data.companies[state.company.id] ?? null : null;
    if (!state.company) {
      state.candidates = [];
      return;
    }
    const workforceCode = state.companyData?.workforceCode ?? null;
    state.candidates = state.workforceDirectory.findCandidates(
      {
        ...state.company,
        workforceCode,
        address: state.collection.data?.company?.address ?? state.companyData?.profile?.address ?? state.company?.address ?? null,
        employeeCount: state.collection.data?.company?.employeeCount ?? state.employeeCount ?? null
      },
      5
    );
    if (workforceCode) {
      state.candidates.sort((left, right) => {
        const leftSelected = (left.code || left.id) === workforceCode ? 1 : 0;
        const rightSelected = (right.code || right.id) === workforceCode ? 1 : 0;
        return rightSelected - leftSelected || right.score - left.score;
      });
    }
  }
  async function refresh({ rememberCompany = true, notice = null } = {}) {
    const refreshId = ++state.refreshId;
    state.loading = true;
    state.error = null;
    state.notice = notice;
    state.runtimeConnectionLost = false;
    try {
      const site = getSite(location.href);
      const company = site?.getCompany(document, location.href) ?? null;
      const employeeCount = company ? site.getEmployeeCount(document) : null;
      const posting = company ? site.getPosting(document, company, location.href) : null;
      let [data, pensionPoolSummary] = await Promise.all([
        loadData(),
        loadPensionPoolSummary()
      ]);
      if (rememberCompany && company) {
        data = await cacheCompanyProfile(company);
      }
      if (refreshId !== state.refreshId) return;
      Object.assign(state, {
        site,
        company,
        posting,
        employeeCount,
        data,
        pensionPoolSummary
      });
      resetPensionPoolUi(company);
      resetPastPostingUi(company?.id ?? null);
      resetGamejobSimpleUi(company?.id ?? null);
      updateDerivedState();
      await initializeSiteCollection(site, refreshId);
    } catch (error) {
      if (refreshId !== state.refreshId) return;
      state.error = error instanceof Error ? error.message : String(error);
      logError(error);
      if (!state.data) state.data = await loadData();
      updateDerivedState();
    } finally {
      if (refreshId === state.refreshId) {
        state.loading = false;
        render();
      }
    }
  }
  async function runAction(operation) {
    state.error = null;
    state.notice = null;
    state.runtimeConnectionLost = false;
    try {
      await operation();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      logError(error);
      render();
    }
  }
  function queueGamejobSearchUpdate(createPatch, notice) {
    const optimisticPatch = createPatch(state.data.settings);
    state.data = {
      ...state.data,
      settings: { ...state.data.settings, ...optimisticPatch }
    };
    render();
    gamejobSearchSaveQueue = gamejobSearchSaveQueue.catch(() => {
    }).then(async () => {
      state.data = await updateSettings(createPatch(state.data.settings));
      state.notice = notice;
      render();
    });
    runAction(() => gamejobSearchSaveQueue);
  }
  function showActionError(message) {
    state.error = message;
    state.notice = null;
    state.runtimeConnectionLost = false;
    render();
  }
  var actions = {
    onCopyExtensionManagementUrl() {
      runAction(async () => {
        await navigator.clipboard.writeText("chrome://extensions/");
        state.notice = "\uD655\uC7A5 \uAD00\uB9AC \uC8FC\uC18C\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.";
        render();
      });
    },
    onRefresh() {
      runAction(() => refresh({ notice: "\uD398\uC774\uC9C0 \uC815\uBCF4\uB97C \uC0C8\uB85C \uC77D\uC5C8\uC2B5\uB2C8\uB2E4." }));
    },
    onSettingsChange(patch, shouldRender = true) {
      runAction(async () => {
        state.data = await updateSettings(patch);
        if (shouldRender) render();
      });
    },
    onToggleCollapsed() {
      actions.onSettingsChange({ collapsed: !state.data.settings.collapsed });
    },
    onToggleSimpleMode() {
      actions.onSettingsChange({ simpleMode: !state.data.settings.simpleMode });
    },
    onToggleOptions() {
      state.optionsOpen = !state.optionsOpen;
      render();
    },
    onDismissSystemMessages() {
      state.error = null;
      state.notice = null;
      state.runtimeConnectionLost = false;
      render();
    },
    onEmbedPanel() {
      if (!getGamejobEmbedContext(document, location.href)) return;
      actions.onSettingsChange({ embedded: true });
    },
    onRestoreFloating() {
      actions.onSettingsChange({ embedded: false });
    },
    onReorderSections(sectionOrder) {
      const merged = mergeVisibleSectionOrder(
        state.data.settings.sectionOrder,
        sectionOrder
      );
      actions.onSettingsChange({ sectionOrder: merged }, false);
    },
    onSelectWorkforce(workforceCode) {
      if (!state.company) return;
      runAction(async () => {
        state.data = await selectWorkforceCompany(
          state.company.id,
          workforceCode
        );
        updateDerivedState();
        state.notice = "\uC778\uB825 \uBE44\uAD50 \uD68C\uC0AC\uB97C \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4.";
        render();
      });
    },
    onLoadRecruitmentCompanyInfo() {
      runAction(() => loadCompanyInformation());
    },
    onLoadGamejobSimplePostingCounts() {
      if (hasCurrentGamejobPostingCountDetails()) return;
      runAction(() => loadCurrentGamejobPostingCounts());
    },
    onRefreshGamejobSimplePostingCounts() {
      runAction(() => loadCurrentGamejobPostingCounts());
    },
    onLoadGamejobListCompanyInformation(company) {
      const normalized = normalizeGamejobCompanyBlock(company);
      const companyKey = getGamejobCompanyBlockKey(normalized);
      if (!normalized?.id || !companyKey) {
        showActionError("\uAC8C\uC784\uC7A1 \uD68C\uC0AC ID\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
        return;
      }
      if (state.loadingGamejobCompanyKeys.has(companyKey) || !state.site?.loadListCompanyInformation) {
        return;
      }
      state.loadingGamejobCompanyKeys.add(companyKey);
      render();
      gamejobCompanyInformationQueue = gamejobCompanyInformationQueue.catch(() => {
      }).then(async () => {
        try {
          const information = await state.site.loadListCompanyInformation(
            normalized,
            location.href
          );
          const storedCompany = {
            id: `gamejob:${normalized.id}`,
            externalId: normalized.id,
            name: information.name ?? normalized.name ?? company.name ?? "\uD68C\uC0AC\uBA85 \uBBF8\uAE30\uB85D",
            url: information.sourceUrl ?? company.url ?? new URL(
              `/Company/Detail?M=${encodeURIComponent(normalized.id)}`,
              location.href
            ).href
          };
          state.data = await saveGamejobListCompanyInformation(
            storedCompany,
            information
          );
          state.notice = `${storedCompany.name} \uD68C\uC0AC\uC815\uBCF4\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.`;
        } finally {
          state.loadingGamejobCompanyKeys.delete(companyKey);
          render();
        }
      });
      runAction(() => gamejobCompanyInformationQueue);
    },
    onLoadGamejobListCompanyPostingCount(company) {
      const normalized = normalizeGamejobCompanyBlock(company);
      const companyKey = getGamejobCompanyBlockKey(normalized);
      if (!normalized?.id || !companyKey) {
        showActionError("\uAC8C\uC784\uC7A1 \uD68C\uC0AC ID\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
        return;
      }
      if (state.loadingGamejobCompanyKeys.has(companyKey) || !state.site?.loadListCompanyPostingCount) {
        return;
      }
      state.loadingGamejobCompanyKeys.add(companyKey);
      render();
      gamejobCompanyInformationQueue = gamejobCompanyInformationQueue.catch(() => {
      }).then(async () => {
        try {
          const information = await state.site.loadListCompanyPostingCount(
            normalized,
            location.href
          );
          const storedCompany = {
            id: `gamejob:${normalized.id}`,
            externalId: normalized.id,
            name: normalized.name ?? company.name ?? "\uD68C\uC0AC\uBA85 \uBBF8\uAE30\uB85D",
            url: company.url ?? new URL(
              `/Company/Detail?M=${encodeURIComponent(normalized.id)}`,
              location.href
            ).href
          };
          state.data = await saveGamejobListCompanyInformation(
            storedCompany,
            information
          );
          state.notice = `${storedCompany.name}\uC758 \uD65C\uC131\xB7\uB9C8\uAC10 \uACF5\uACE0 \uC218\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.`;
        } finally {
          state.loadingGamejobCompanyKeys.delete(companyKey);
          render();
        }
      });
      runAction(() => gamejobCompanyInformationQueue);
    },
    onSaveGamejobListPosting(posting) {
      const company = normalizeGamejobCompanyBlock(posting?.company);
      if (!company?.id || !posting?.id || !posting?.url) {
        showActionError(
          "\uD604\uC7AC \uBAA9\uB85D\uC5D0\uC11C \uD68C\uC0AC \uB610\uB294 \uACF5\uACE0 \uC2DD\uBCC4\uC790\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
        );
        return;
      }
      const storedCompany = {
        id: `gamejob:${company.id}`,
        externalId: company.id,
        name: company.name ?? "\uD68C\uC0AC\uBA85 \uBBF8\uAE30\uB85D",
        url: posting.company?.url ?? new URL(
          `/Company/Detail?M=${encodeURIComponent(company.id)}`,
          location.href
        ).href
      };
      gamejobListPostingSaveQueue = gamejobListPostingSaveQueue.catch(() => {
      }).then(async () => {
        state.data = await saveListedPosting(storedCompany, posting);
        state.notice = `${storedCompany.name} \xB7 ${posting.title} \uACF5\uACE0\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.`;
        render();
      });
      runAction(() => gamejobListPostingSaveQueue);
    },
    onPickWorkforceFile() {
      runAction(async () => {
        const file = await pickTextFile(".csv,.json,text/csv,application/json");
        if (!file) return;
        const records = parseWorkforceData(await file.text(), file.name);
        state.data = await saveWorkforceRecords(records);
        updateDerivedState();
        state.notice = `\uC778\uB825 \uB808\uCF54\uB4DC ${records.length.toLocaleString("ko-KR")}\uAC1C\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.`;
        render();
      });
    },
    onOpenPensionDataPortal() {
      window.open(PENSION_PORTAL_DATASET_URL, "_blank", "noopener,noreferrer");
    },
    onPickPensionCsvFiles() {
      runAction(async () => {
        const requiredLatestMonth = getRequiredPensionMonthForImport();
        const files = await pickTextFiles(".csv,text/csv", true);
        if (files.length === 0) return;
        await withPensionActivity("CSV \uAC00\uACF5\xB7\uBCD1\uD569 \uC911", async () => {
          const result = await importPensionCsvFiles(files, {
            requiredLatestMonth
          });
          state.pensionPoolSummary = result.summary;
          await invalidatePensionSearchCache();
          await refreshPensionSearchResults();
          const acceptedRows = result.diagnostics.reduce(
            (sum, item) => sum + item.acceptedRows,
            0
          );
          state.notice = `\uAD6D\uBBFC\uC5F0\uAE08 CSV ${files.length}\uAC1C\uC5D0\uC11C ${acceptedRows.toLocaleString("ko-KR")}\uD589\uC744 \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4. \uAC00\uC785\uC790 \uC218 10\uBA85 \uC774\uD558 \uC0AC\uC5C5\uC7A5 ${formatNumber(result.excludedLocationCount)}\uAC1C\uB97C \uC81C\uC678\uD588\uC2B5\uB2C8\uB2E4.`;
        });
      });
    },
    onSearchPensionPool(query) {
      runAction(async () => {
        state.pensionPoolUi.query = String(query ?? "").trim();
        state.pensionPoolUi.searched = Boolean(state.pensionPoolUi.query);
        if (!state.pensionPoolUi.searched) {
          state.pensionPoolUi.results = [];
          render();
          return;
        }
        await withPensionActivity("\uD68C\uC0AC\uBA85 \uAC80\uC0C9 \uC911", async () => {
          await refreshPensionSearchResults();
        });
      });
    },
    onBindPensionCompany(result) {
      const sourceName = state.company?.name ?? String(state.pensionPoolUi.query ?? "").trim();
      if (!sourceName || !result?.name) return;
      runAction(async () => {
        if (state.site?.id === "jobkorea" && (!state.collection.data?.company?.informationLoaded || !state.collection.data?.company?.address)) {
          await loadCompanyInformation();
          if (!state.collection.data?.company?.informationLoaded) {
            throw new Error(
              "\uBC14\uC778\uB529\uC5D0 \uD544\uC694\uD55C \uC7A1\uCF54\uB9AC\uC544 \uD68C\uC0AC\uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
            );
          }
          if (!state.collection.data.company.address) {
            throw new Error(
              "\uC7A1\uCF54\uB9AC\uC544 \uD68C\uC0AC\uC815\uBCF4\uC5D0\uC11C \uC8FC\uC18C\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD574 \uBC14\uC778\uB529\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
            );
          }
          await refreshPensionSearchResults();
        }
        const candidate = state.pensionPoolUi.results.find(
          (item) => item.name === result.name && item.matchedAddress === result.matchedAddress
        ) ?? state.pensionPoolUi.results.find((item) => item.name === result.name) ?? result;
        const restriction = getPensionBindingRestriction(
          candidate,
          state.collection.data?.company?.employeeCount ?? state.employeeCount ?? null,
          sourceName
        );
        if (restriction) throw new Error(restriction);
        const addressScore = candidate.signals?.address;
        const addressWarning = !Number.isFinite(addressScore) || addressScore < 30;
        const confirmed = confirm(
          createPensionBindingConfirmationMessage(
            sourceName,
            candidate,
            addressWarning
          )
        );
        if (!confirmed) {
          return;
        }
        state.data = await bindPensionCompany(sourceName, {
          name: candidate.name,
          address: candidate.matchedAddress,
          addressScore,
          addressWarning
        });
        await refreshPensionSearchResults();
        state.notice = `${sourceName}\uC744(\uB97C) ${candidate.name}\uC5D0 \uC218\uB3D9 \uBC14\uC778\uB4DC\uD588\uC2B5\uB2C8\uB2E4.`;
        render();
      });
    },
    onUnbindPensionCompany() {
      const sourceName = state.company?.name ?? String(state.pensionPoolUi.query ?? "").trim();
      if (!sourceName) return;
      runAction(async () => {
        state.data = await unbindPensionCompany(sourceName);
        await refreshPensionSearchResults();
        state.notice = `${sourceName}\uC758 \uBC14\uC778\uB529\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4.`;
        render();
      });
    },
    onDeletePensionPoolMonth(month) {
      runAction(async () => {
        await withPensionActivity(`${month} \uC804\uCCB4 \uC0AD\uC81C \uC911`, async () => {
          const result = await deletePensionPoolMonth2(month);
          state.pensionPoolSummary = result.summary;
          await invalidatePensionSearchCache();
          await refreshPensionSearchResults();
          state.notice = `${month} \uC5F0\uAE08 \uAE30\uB85D\uC744 \uBAA8\uB4E0 \uD68C\uC0AC\uC5D0\uC11C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.`;
        });
      });
    },
    onLoadPensionPortalYear(year, { automatic = false } = {}) {
      const selectedYear = Number(year);
      state.pensionPortalUi = {
        ...state.pensionPortalUi,
        year: selectedYear,
        loading: true
      };
      render();
      runAction(async () => {
        try {
          await withPensionActivity("\uACF5\uACF5\uB370\uC774\uD130 \uD30C\uC77C \uBAA9\uB85D \uD655\uC778 \uC911", async () => {
            const response = await sendRuntimeMessage({
              type: "hayoung:pension-portal-list",
              year: selectedYear
            });
            if (!response?.ok) {
              throw new Error(
                response?.error ?? "\uACF5\uACF5\uB370\uC774\uD130 \uBAA9\uB85D\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
              );
            }
            state.pensionPortalUi.files = response.files ?? [];
            state.pensionPortalUi.loadedYear = selectedYear;
            if (selectedYear === (/* @__PURE__ */ new Date()).getFullYear()) {
              const latestMonth = getLatestPortalFileMonth(
                state.pensionPortalUi.files
              );
              if (!latestMonth) {
                throw new Error("\uACF5\uACF5\uB370\uC774\uD130 \uCD5C\uC2E0 \uC6D4\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
              }
              state.data = await recordPensionPolicyCheck(latestMonth);
            }
            const latestRequired = state.data.pensionPolicy?.requiredLatestMonth ?? null;
            const latestInstalled = isRequiredPensionMonthInstalled(
              state.pensionPoolSummary,
              state.data.pensionPolicy
            );
            state.notice = latestRequired && !latestInstalled ? `\uCD5C\uC2E0 ${latestRequired} \uD30C\uC77C\uC744 \uBA3C\uC800 \uCD94\uAC00\uD574\uC57C \uD569\uB2C8\uB2E4.` : automatic ? `\uCD5C\uC2E0 \uC5F0\uAE08 \uD30C\uC77C \uD655\uC778 \uC644\uB8CC: ${latestRequired ?? "\uD655\uC778 \uBD88\uAC00"}` : `${selectedYear}\uB144 \uACF5\uACF5 CSV ${state.pensionPortalUi.files.length}\uAC1C\uB97C \uCC3E\uC558\uC2B5\uB2C8\uB2E4.`;
          });
        } finally {
          state.pensionPortalUi.loading = false;
          render();
        }
      });
    },
    onImportPensionPortalFile(file) {
      if (state.pensionActivity.busy) return;
      runAction(async () => {
        const requiredLatestMonth = getRequiredPensionMonthForImport();
        const latestInstalled = isRequiredPensionMonthInstalled(
          state.pensionPoolSummary,
          state.data.pensionPolicy
        );
        const fileMonth = file?.month ?? getPensionPortalFileMonth(file?.name) ?? null;
        if (!latestInstalled && String(fileMonth ?? "") !== requiredLatestMonth) {
          throw new Error(`\uCD5C\uC2E0 ${requiredLatestMonth} \uD30C\uC77C\uC744 \uBA3C\uC800 \uCD94\uAC00\uD558\uC138\uC694.`);
        }
        await withPensionActivity("CSV \uBC1B\uAE30\xB7\uAC00\uACF5\xB7\uC5F0\uAE08 \uD480 \uBCD1\uD569 \uC911", async () => {
          const response = await sendRuntimeMessage({
            type: "hayoung:pension-portal-import",
            file: { ...file, month: fileMonth, requiredLatestMonth }
          });
          if (!response?.ok) {
            if (response?.requiresPortal) {
              window.open(
                response.url ?? PENSION_PORTAL_DATASET_URL,
                "_blank",
                "noopener,noreferrer"
              );
              state.notice = "\uACF5\uACF5\uB370\uC774\uD130\uD3EC\uD138\uC758 \uC694\uCCAD \uC81C\uD55C \uD655\uC778\uC774 \uD544\uC694\uD574 \uACF5\uC2DD \uD398\uC774\uC9C0\uB97C \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4.";
              return;
            }
            throw new Error(
              response?.error ?? "\uACF5\uACF5 CSV\uB97C \uC5F0\uAE08 \uD480\uC5D0 \uBC18\uC601\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
            );
          }
          state.pensionPoolSummary = response.summary;
          await refreshPensionSearchResults();
          state.notice = `${file.name}\uC744 \uC5F0\uAE08 \uD480\uC5D0 \uBC14\uB85C \uBC18\uC601\uD588\uC2B5\uB2C8\uB2E4. \uAC00\uC785\uC790 \uC218 10\uBA85 \uC774\uD558 \uC0AC\uC5C5\uC7A5 ${formatNumber(response.excludedLocationCount)}\uAC1C\uB97C \uC81C\uC678\uD588\uC2B5\uB2C8\uB2E4.`;
        });
      });
    },
    onSaveOfficialWorkforce() {
      if (!state.company || state.site?.id !== "gamejob") return;
      const employeeCount = state.collection.data?.company?.employeeCount ?? state.employeeCount;
      if (!Number.isFinite(employeeCount)) return;
      runAction(async () => {
        state.data = await saveGamejobOfficialWorkforce(
          state.company,
          employeeCount
        );
        updateDerivedState();
        state.notice = `\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218 ${employeeCount.toLocaleString("ko-KR")}\uBA85\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.`;
        render();
      });
    },
    onDeleteOfficialWorkforceRecord(recordId2) {
      if (!state.company || state.site?.id !== "gamejob") return;
      runAction(async () => {
        state.data = await deleteGamejobOfficialWorkforceRecord(
          state.company.id,
          recordId2
        );
        updateDerivedState();
        state.notice = "\uAC8C\uC784\uC7A1 \uD398\uC774\uC9C0 \uD45C\uC2DC \uC0AC\uC6D0\uC218 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.";
        render();
      });
    },
    onSaveGamejobPostingDetail() {
      if (!state.company || !state.posting || state.site?.id !== "gamejob")
        return;
      runAction(async () => {
        state.data = await saveGamejobPostingDetail(state.company, state.posting);
        updateDerivedState();
        state.notice = "\uD604\uC7AC \uACF5\uACE0\uC758 \uC0C1\uC138 \uC218\uC815 \uAE30\uB85D\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.";
        render();
      });
    },
    onLoadNextRecruitmentPage(scrollTop) {
      runAction(() => loadNextRecruitmentPage({ scrollTop }));
    },
    onPastPostingSearch(query) {
      state.pastPostingUi = updatePastPostingQuery(state.pastPostingUi, query);
      render();
    },
    onPastPostingCalculateDuplicates(query = "") {
      state.pastPostingUi.query = String(query ?? "").trim();
      state.pastPostingUi.duplicateOnly = !state.pastPostingUi.duplicateOnly;
      render();
    },
    onAddFavoritePostingSearch(query) {
      const value = String(query ?? "").trim();
      if (!value) return;
      runAction(async () => {
        const favorites = [
          .../* @__PURE__ */ new Set([
            ...state.data.settings.favoritePostingSearches ?? [],
            value
          ])
        ];
        state.data = await updateSettings({ favoritePostingSearches: favorites });
        state.pastPostingUi.query = value;
        render();
      });
    },
    onSelectFavoritePostingSearch(query) {
      state.pastPostingUi = updatePastPostingQuery(state.pastPostingUi, query);
      render();
    },
    onRemoveFavoritePostingSearch(query) {
      const value = String(query ?? "").trim();
      if (!value) return;
      runAction(async () => {
        const favorites = (state.data.settings.favoritePostingSearches ?? []).filter((favorite) => favorite !== value);
        state.data = await updateSettings({ favoritePostingSearches: favorites });
        render();
      });
    },
    onHideGamejobPosting(posting) {
      if (!addHiddenGamejobPosting(state.data.settings, posting)) {
        showActionError("\uD604\uC7AC \uAC8C\uC784\uC7A1 \uACF5\uACE0 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
        return;
      }
      queueGamejobSearchUpdate(
        (settings) => addHiddenGamejobPosting(settings, posting),
        "\uC120\uD0DD\uD55C \uAC8C\uC784\uC7A1 \uACF5\uACE0\uB97C \uBAA9\uB85D\uC5D0\uC11C \uC228\uACBC\uC2B5\uB2C8\uB2E4."
      );
    },
    onShowGamejobPosting(postingId) {
      const value = String(postingId ?? "");
      queueGamejobSearchUpdate(
        (settings) => removeHiddenGamejobPosting(settings, value),
        "\uAC8C\uC784\uC7A1 \uACF5\uACE0 \uC228\uAE30\uAE30\uB97C \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onHideGamejobCompany(company) {
      if (!addHiddenGamejobCompany(state.data.settings, company)) {
        showActionError("\uD68C\uC0AC\uBA85, \uD68C\uC0AC\uC815\uBCF4 URL \uB610\uB294 M ID\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        return;
      }
      queueGamejobSearchUpdate(
        (settings) => addHiddenGamejobCompany(settings, company),
        "\uC120\uD0DD\uD55C \uAC8C\uC784\uC7A1 \uD68C\uC0AC\uB97C \uBAA9\uB85D\uC5D0\uC11C \uC228\uACBC\uC2B5\uB2C8\uB2E4."
      );
    },
    onShowGamejobCompany(companyKey) {
      queueGamejobSearchUpdate(
        (settings) => removeHiddenGamejobCompany(settings, companyKey),
        "\uAC8C\uC784\uC7A1 \uD68C\uC0AC \uC228\uAE30\uAE30\uB97C \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onAddGamejobHidePhrase(phrase) {
      if (!addGamejobPhrase(state.data.settings, "gamejobHidePhrases", phrase))
        return;
      queueGamejobSearchUpdate(
        (settings) => addGamejobPhrase(settings, "gamejobHidePhrases", phrase),
        "\uAC8C\uC784\uC7A1 \uACF5\uACE0 \uC81C\uBAA9 \uC228\uAE30\uAE30 \uBB38\uAD6C\uB97C \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onRemoveGamejobHidePhrase(phrase) {
      queueGamejobSearchUpdate(
        (settings) => removeGamejobPhrase(settings, "gamejobHidePhrases", phrase),
        "\uAC8C\uC784\uC7A1 \uACF5\uACE0 \uC81C\uBAA9 \uC228\uAE30\uAE30 \uBB38\uAD6C\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onToggleGamejobHidePhrase(phrase, enabled) {
      actions.toggleGamejobPhraseSetting(
        "gamejobHidePhrases",
        phrase,
        enabled
      );
    },
    onAddGamejobHideException(phrase) {
      actions.addGamejobPhraseSetting(
        "gamejobHideExceptions",
        phrase,
        "\uC228\uAE30\uAE30 \uD544\uD130 \uBB38\uAD6C\uB97C \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onRemoveGamejobHideException(phrase) {
      actions.removeGamejobPhraseSetting(
        "gamejobHideExceptions",
        phrase,
        "\uC228\uAE30\uAE30 \uD544\uD130 \uBB38\uAD6C\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onToggleGamejobHideException(phrase, enabled) {
      actions.toggleGamejobPhraseSetting(
        "gamejobHideExceptions",
        phrase,
        enabled
      );
    },
    onAddGamejobFocusKeyword(phrase) {
      actions.addGamejobPhraseSetting(
        "gamejobFocusKeywords",
        phrase,
        "\uAC80\uC0C9 \uBB38\uAD6C\uB97C \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onRemoveGamejobFocusKeyword(phrase) {
      actions.removeGamejobPhraseSetting(
        "gamejobFocusKeywords",
        phrase,
        "\uAC80\uC0C9 \uBB38\uAD6C\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onToggleGamejobFocusKeyword(phrase, enabled) {
      actions.toggleGamejobPhraseSetting(
        "gamejobFocusKeywords",
        phrase,
        enabled
      );
    },
    addGamejobPhraseSetting(key, phrase, notice) {
      if (!addGamejobPhrase(state.data.settings, key, phrase)) return;
      queueGamejobSearchUpdate(
        (settings) => addGamejobPhrase(settings, key, phrase),
        notice
      );
    },
    removeGamejobPhraseSetting(key, phrase, notice) {
      queueGamejobSearchUpdate(
        (settings) => removeGamejobPhrase(settings, key, phrase),
        notice
      );
    },
    toggleGamejobPhraseSetting(key, phrase, enabled) {
      if (!setGamejobPhraseEnabled(state.data.settings, key, phrase, enabled)) {
        return;
      }
      queueGamejobSearchUpdate(
        (settings) => setGamejobPhraseEnabled(settings, key, phrase, enabled),
        enabled ? "\uAC80\uC0C9 \uBB38\uAD6C\uB97C \uCF30\uC2B5\uB2C8\uB2E4." : "\uAC80\uC0C9 \uBB38\uAD6C\uB97C \uAED0\uC2B5\uB2C8\uB2E4."
      );
    },
    onReorderGamejobSearchItems(kind, orderedKeys) {
      if (!reorderGamejobSearchItems(state.data.settings, kind, orderedKeys))
        return;
      queueGamejobSearchUpdate(
        (settings) => reorderGamejobSearchItems(settings, kind, orderedKeys),
        "\uAC80\uC0C9 \uAC15\uD654 \uD56D\uBAA9 \uC21C\uC11C\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4."
      );
    },
    onSelectPastPosting(postingId) {
      state.pastPostingUi.selectedPostingId = postingId;
      render();
    },
    onShowPastPostingList() {
      state.pastPostingUi.selectedPostingId = null;
      render();
    },
    onSavePastPosting(postingId, scrollTop) {
      if (!state.company) return;
      const posting = findLivePastPosting(postingId);
      if (!posting) return;
      if (Number.isFinite(scrollTop)) {
        state.pastPostingUi.scrollTop = Math.max(0, scrollTop);
      }
      runAction(async () => {
        state.data = await saveListedPosting(state.company, posting);
        updateDerivedState();
        state.notice = `${posting.title} \uACF5\uACE0\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.`;
        render();
      });
    },
    onClearAll() {
      runAction(async () => {
        state.data = await clearAllData();
        updateDerivedState();
        state.notice = "Hayoung4 \uB370\uC774\uD130\uB97C \uCD08\uAE30\uD654\uD588\uC2B5\uB2C8\uB2E4.";
        render();
      });
    }
  };
  function watchPageChanges() {
    const checkUrl = () => {
      if (location.href === state.lastUrl) return;
      state.lastUrl = location.href;
      refresh();
    };
    const observer = new MutationObserver(checkUrl);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    addEventListener("popstate", checkUrl);
    addEventListener("hashchange", checkUrl);
  }
  function notifyContentReady() {
    try {
      const pending = chrome.runtime.sendMessage({
        type: "hayoung:content-ready",
        url: location.href
      });
      pending?.catch?.(() => {
      });
    } catch {
    }
  }
  async function startApp() {
    try {
      state.data = await loadData();
      render();
      await refresh();
      void refreshUpdateStatus().catch((error) => {
        logError("Git \uC5C5\uB370\uC774\uD2B8 \uD655\uC778 \uC2E4\uD328", error);
      });
      if (state.data.pensionPolicy?.bundledSeedVersion !== BUNDLED_PENSION_SEED_VERSION) {
        try {
          const seed = await sendRuntimeMessage({
            type: "hayoung:pension-seed",
            mergeExisting: true
          });
          if (!seed?.ok) {
            throw new Error(
              seed?.error ?? "\uB0B4\uC7A5 \uAD6D\uBBFC\uC5F0\uAE08 JSON \uC124\uCE58\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."
            );
          }
          state.pensionPoolSummary = seed.summary ?? state.pensionPoolSummary;
          state.data = await recordBundledPensionSeedApplied(
            BUNDLED_PENSION_SEED_VERSION
          );
          if (seed.imported) {
            state.notice = `\uB0B4\uC7A5 \uAD6D\uBBFC\uC5F0\uAE08 \uCD5C\uC2E0 \uC790\uB8CC ${formatNumber(seed.summary?.companyCount ?? 0)}\uAC1C \uD68C\uC0AC\uB97C \uC124\uCE58\uD588\uC2B5\uB2C8\uB2E4.`;
            render();
          }
          await startAutomaticPensionSearch();
        } catch (error) {
          state.error = runtimeConnectionError(error).message;
          logError("\uB0B4\uC7A5 \uAD6D\uBBFC\uC5F0\uAE08 JSON \uC124\uCE58 \uC2E4\uD328", error);
          render();
        }
      }
      if (isPensionPolicyCheckDue(state.data.pensionPolicy)) {
        actions.onLoadPensionPortalYear((/* @__PURE__ */ new Date()).getFullYear(), {
          automatic: true
        });
      }
      watchPageChanges();
      notifyContentReady();
      setTimeout(() => {
        if (!state.company) refresh();
      }, 1200);
      setTimeout(() => {
        if (!state.company) refresh();
      }, 3500);
    } catch (error) {
      logError("\uC571 \uC2DC\uC791 \uC2E4\uD328", error);
    }
  }

  // src/main.js
  startApp();
})();
