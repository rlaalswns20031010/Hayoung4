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

  // src/pension-data-portal.js
  var PENSION_PORTAL_ORIGIN = "https://www.data.go.kr";
  var PENSION_PORTAL_DATASET_ID = "15083277";
  var PENSION_PORTAL_EARLIEST_YEAR = 2015;
  var PENSION_PORTAL_DATASET_URL = `${PENSION_PORTAL_ORIGIN}/data/${PENSION_PORTAL_DATASET_ID}/fileData.do`;
  function decodeHtml(value) {
    return String(value ?? "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  }
  function textFromHtml(value) {
    return cleanText(decodeHtml(String(value ?? "").replace(/<[^>]*>/g, " ")));
  }
  function attribute(attributes, name) {
    const match = String(attributes).match(
      new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i")
    );
    return match?.[1] ?? null;
  }
  function getPensionPortalFileYear(nameValue) {
    const name = cleanText(nameValue);
    const compactDate = name.match(/(?:_|\b)(20\d{2})(?:[01]\d)(?:[0-3]\d)\b/);
    if (compactDate) return Number(compactDate[1]);
    const KoreanYear = name.match(/\b(20\d{2})\s*년/);
    if (KoreanYear) return Number(KoreanYear[1]);
    const slashDate = name.match(/(?:_|\b)\d{1,2}\/\d{1,2}\/(20\d{2})\b/);
    return slashDate ? Number(slashDate[1]) : null;
  }
  function getPensionPortalFileMonth(nameValue) {
    const name = cleanText(nameValue);
    const compact = name.match(/(20\d{2})(0[1-9]|1[0-2])(?:[0-3]\d)?/);
    if (compact) return `${compact[1]}-${compact[2]}`;
    const korean = name.match(/(20\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월/);
    if (korean) return `${korean[1]}-${korean[2].padStart(2, "0")}`;
    const slash = name.match(/(0?[1-9]|1[0-2])\/(?:[0-3]?\d)\/(20\d{2})/);
    return slash ? `${slash[2]}-${slash[1].padStart(2, "0")}` : null;
  }
  function normalizeYear(value) {
    const year = Number(value);
    const latest = (/* @__PURE__ */ new Date()).getFullYear();
    if (!Number.isInteger(year) || year < PENSION_PORTAL_EARLIEST_YEAR || year > latest) {
      throw new Error(
        `\uACF5\uACF5\uB370\uC774\uD130 \uD30C\uC77C \uC5F0\uB3C4\uB294 ${PENSION_PORTAL_EARLIEST_YEAR}~${latest} \uC0AC\uC774\uC5EC\uC57C \uD569\uB2C8\uB2E4.`
      );
    }
    return year;
  }
  function parsePensionPortalFileList(htmlValue, yearValue) {
    const html = String(htmlValue ?? "");
    const year = normalizeYear(yearValue);
    const files = [];
    const title = textFromHtml(
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ).replace(/\s*\|\s*공공데이터포털.*$/u, "");
    const currentDetailPk = html.match(
      /fileDetailObj\.fn_fileDataDown\(\s*['"]15083277['"]\s*,\s*['"]([^'"]+)['"]/
    )?.[1];
    if (currentDetailPk && getPensionPortalFileYear(title) === year) {
      files.push({
        name: title,
        month: getPensionPortalFileMonth(title),
        publicDataPk: PENSION_PORTAL_DATASET_ID,
        publicDataDetailPk: currentDetailPk,
        publicDataDetailSn: "1",
        current: true
      });
    }
    for (const match of html.matchAll(
      /<a\b([^>]*\bopenFileDetailPopup\b[^>]*)>([\s\S]*?)<\/a>/gi
    )) {
      const name = textFromHtml(match[2]);
      const publicDataDetailPk = attribute(match[1], "data-public-pk");
      if (!publicDataDetailPk || getPensionPortalFileYear(name) !== year)
        continue;
      files.push({
        name,
        month: getPensionPortalFileMonth(name),
        publicDataPk: PENSION_PORTAL_DATASET_ID,
        publicDataDetailPk,
        publicDataDetailSn: attribute(match[1], "data-public-detail-sn") ?? "1",
        current: false
      });
    }
    const seen = /* @__PURE__ */ new Set();
    return files.filter((file) => {
      if (seen.has(file.publicDataDetailPk)) return false;
      seen.add(file.publicDataDetailPk);
      return true;
    });
  }
  function assertResponse(response, label) {
    if (!response?.ok) {
      throw new Error(
        `${label} \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. (${response?.status ?? "?"})`
      );
    }
    return response;
  }
  async function fetchPensionPortalFileList(year, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== "function") {
      throw new Error("\uACF5\uACF5\uB370\uC774\uD130\uD3EC\uD138\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    const response = await fetchImpl(PENSION_PORTAL_DATASET_URL, {
      cache: "no-store",
      credentials: "include"
    });
    assertResponse(response, "\uACF5\uACF5\uB370\uC774\uD130 \uD30C\uC77C \uBAA9\uB85D");
    const pageHtml = await response.text();
    const currentDetailPk = pageHtml.match(
      /fileDetailObj\.fn_fileDataDown\(\s*['"]15083277['"]\s*,\s*['"]([^'"]+)['"]/
    )?.[1];
    if (!currentDetailPk) {
      throw new Error("\uACF5\uACF5\uB370\uC774\uD130 \uCD5C\uC2E0 \uD30C\uC77C \uC2DD\uBCC4\uC790\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }
    const historyResponse = await postForm(
      fetchImpl,
      "/tcs/dss/selectHistAndCsvData.do",
      {
        publicDataPk: PENSION_PORTAL_DATASET_ID,
        publicDataDetailPk: currentDetailPk
      },
      "\uACF5\uACF5\uB370\uC774\uD130 \uACFC\uAC70 \uD30C\uC77C \uBAA9\uB85D"
    );
    return parsePensionPortalFileList(
      `${pageHtml}
${await historyResponse.text()}`,
      year
    );
  }
  function parsePensionPortalDownloadDescriptor(htmlValue) {
    const html = String(htmlValue ?? "");
    const match = html.match(
      /fn_fileDataDown\(\s*['"]15083277['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]csv['"]\s*\)/i
    );
    if (!match)
      throw new Error("\uC120\uD0DD\uD55C \uACF5\uACF5 CSV\uC758 \uB2E4\uC6B4\uB85C\uB4DC \uC815\uBCF4\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    return {
      publicDataPk: PENSION_PORTAL_DATASET_ID,
      publicDataDetailPk: match[1],
      atchFileId: match[2],
      fileDetailSn: match[3]
    };
  }
  async function postForm(fetchImpl, path, values, label) {
    const response = await fetchImpl(`${PENSION_PORTAL_ORIGIN}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values).toString()
    });
    assertResponse(response, label);
    return response;
  }
  function parseJsonText(text, label) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label} \uC751\uB2F5\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    }
  }
  async function resolvePensionPortalDownload(file, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== "function") {
      throw new Error("\uACF5\uACF5\uB370\uC774\uD130\uD3EC\uD138\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    const detailPk = cleanText(file?.publicDataDetailPk);
    if (!detailPk.startsWith("uddi:")) {
      throw new Error("\uACF5\uACF5\uB370\uC774\uD130 \uD30C\uC77C \uC2DD\uBCC4\uC790\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    const detailResponse = await postForm(
      fetchImpl,
      "/tcs/dss/selectDpkDetailInfo.do",
      { publicDataDetailPk: detailPk },
      "\uACF5\uACF5\uB370\uC774\uD130 \uC0C1\uC138\uC815\uBCF4"
    );
    const descriptor = parsePensionPortalDownloadDescriptor(
      await detailResponse.text()
    );
    const registerResponse = await postForm(
      fetchImpl,
      "/tcs/dss/selectFileDataDownload.do",
      {
        ...descriptor,
        publicDataTyCode: "PR0051"
      },
      "\uACF5\uACF5\uB370\uC774\uD130 \uB2E4\uC6B4\uB85C\uB4DC \uB4F1\uB85D"
    );
    const registered = parseJsonText(
      await registerResponse.text(),
      "\uACF5\uACF5\uB370\uC774\uD130 \uB2E4\uC6B4\uB85C\uB4DC \uB4F1\uB85D"
    );
    if (!registered.status) {
      throw new Error(registered.error ?? "\uACF5\uACF5 CSV \uB2E4\uC6B4\uB85C\uB4DC\uAC00 \uAC70\uBD80\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    }
    const atchFileId = cleanText(registered.atchFileId) || descriptor.atchFileId;
    const fileDetailSn = cleanText(registered.fileDetailSn) || descriptor.fileDetailSn;
    const dataName = cleanText(registered.dataSetFileDetailInfo?.publicDataSj) || cleanText(registered.dataSetFileDetailInfo?.dataNm) || cleanText(file?.name);
    const limitResponse = await postForm(
      fetchImpl,
      "/cmm/cmm/check-limit.json",
      { atchFileId, fileDetailSn },
      "\uACF5\uACF5\uB370\uC774\uD130 \uB2E4\uC6B4\uB85C\uB4DC \uC81C\uD55C \uD655\uC778"
    );
    const limit = parseJsonText(
      await limitResponse.text(),
      "\uACF5\uACF5\uB370\uC774\uD130 \uB2E4\uC6B4\uB85C\uB4DC \uC81C\uD55C \uD655\uC778"
    );
    if (limit.needCaptcha) {
      return { requiresPortal: true, url: PENSION_PORTAL_DATASET_URL };
    }
    const url = new URL("/cmm/cmm/fileDownload.do", PENSION_PORTAL_ORIGIN);
    url.searchParams.set("atchFileId", atchFileId);
    url.searchParams.set("fileDetailSn", fileDetailSn);
    if (dataName) url.searchParams.set("dataNm", dataName);
    return { requiresPortal: false, url: url.href, name: dataName };
  }

  // src/posting-records.js
  var SEOUL_OFFSET_MS = 9 * 60 * 60 * 1e3;

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

  // src/pension-policy.js
  var PENSION_LATEST_CHECK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1e3;
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
  var DEFAULT_PANEL_SIZE = Object.freeze({ width: 390, height: 720 });
  var MIN_PANEL_SIZE = Object.freeze({ width: 320, height: 250 });
  var THEME_VALUES = new Set(PANEL_THEMES.map(({ value }) => value));
  var TONE_VALUES = new Set(PANEL_TONES.map(({ value }) => value));

  // src/storage-schema.js
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

  // src/storage.js
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
  var updateDataQueue = Promise.resolve();

  // src/pension-pool.js
  var PENSION_POOL_SCHEMA_VERSION = 1;
  var OFFICIAL_PENSION_MIN_CURRENT_SUBSCRIBERS = 10;
  var COLUMN_ALIASES = Object.freeze({
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
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function clone(value) {
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
    const indexes = resolveCsvColumnIndexes(headerRow, COLUMN_ALIASES);
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
    const timestamp = nowIso();
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
        ).map((location) => ({
          address: location.address ?? null,
          months: sortMonths(location.months)
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
  function normalizeSearchText(value) {
    return cleanText(value).normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]+/gu, "");
  }
  function latestLocationSnapshot(location) {
    const month = Object.keys(location.months ?? {})[0] ?? null;
    return month ? { month, ...location.months[month] } : null;
  }
  function addressSimilarity(left, right) {
    const a = normalizeSearchText(left);
    const b = normalizeSearchText(right);
    if (!a || !b) return null;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    return calculateNameSimilarity(a, b);
  }
  function searchBigrams(value) {
    if (!value) return [];
    if (value.length < 2) return [value];
    return [
      ...new Set(
        Array.from(
          { length: value.length - 1 },
          (_, index) => value.slice(index, index + 2)
        )
      )
    ];
  }
  function createPensionSearchIndex(poolValue) {
    const pool = normalizePensionPool(poolValue);
    return createPensionSearchIndexFromNormalizedPool(pool);
  }
  function createPensionSearchIndexFromNormalizedPool(pool) {
    const entries = Object.entries(pool.companies).map(([name, locations]) => {
      const indexedLocations = locations.map((location) => ({
        ...location,
        latest: latestLocationSnapshot(location)
      }));
      const defaultLocation = indexedLocations.reduce(
        (best, location) => !best || String(location.latest?.month ?? "") > String(best.latest?.month ?? "") || location.latest?.month === best.latest?.month && (location.latest?.subscribers ?? -1) > (best.latest?.subscribers ?? -1) ? location : best,
        null
      );
      return {
        name,
        normalizedName: normalizeCompanyName(name),
        normalizedSearchName: normalizeSearchText(name),
        locations: indexedLocations,
        defaultLocation
      };
    });
    const storedNameIndex = /* @__PURE__ */ new Map();
    const exactNameIndex = /* @__PURE__ */ new Map();
    const nameGramIndex = /* @__PURE__ */ new Map();
    entries.forEach((entry, index) => {
      storedNameIndex.set(entry.name, index);
      const exactIndexes = exactNameIndex.get(entry.normalizedName) ?? [];
      exactIndexes.push(index);
      exactNameIndex.set(entry.normalizedName, exactIndexes);
      for (const gram of searchBigrams(entry.normalizedName)) {
        const indexes = nameGramIndex.get(gram) ?? [];
        indexes.push(index);
        nameGramIndex.set(gram, indexes);
      }
    });
    return {
      entries,
      storedNameIndex,
      exactNameIndex,
      nameGramIndex,
      companyBindings: pool.companyBindings ?? {}
    };
  }
  function normalizePreferredMatch(value) {
    const name = cleanText(value?.name);
    return name ? { name, address: cleanText(value?.address) || null } : null;
  }
  function selectBestLocation(entry, preferredMatch, exactBoundLocation, referenceAddress) {
    let location = null;
    if (exactBoundLocation && preferredMatch?.address) {
      location = entry.locations.find(
        (candidate) => candidate.address === preferredMatch.address
      );
    }
    let addressScore = null;
    if (!location && referenceAddress) {
      for (const candidate of entry.locations) {
        const score = addressSimilarity(referenceAddress, candidate.address);
        if (score !== null && (addressScore === null || score > addressScore)) {
          addressScore = score;
          location = candidate;
        }
      }
    }
    location ??= entry.defaultLocation;
    return {
      location: location ?? null,
      addressScore: exactBoundLocation && preferredMatch?.address ? addressSimilarity(preferredMatch.address, location?.address) : addressScore
    };
  }
  function getSubscriberChange(location) {
    const orderedMonths = Object.keys(location?.months ?? {});
    const [latestMonth, previousMonth] = orderedMonths;
    if (!latestMonth || !previousMonth) {
      return { subscriberChange: null, previousMonth: previousMonth ?? null };
    }
    return {
      subscriberChange: location.months[latestMonth].subscribers - location.months[previousMonth].subscribers,
      previousMonth
    };
  }
  function searchPensionIndex(index, criteriaValue, limit = 5) {
    const criteria = typeof criteriaValue === "string" ? { name: criteriaValue } : criteriaValue ?? {};
    const queryText = normalizeSearchText(criteria.name);
    const queryName = normalizeCompanyName(criteria.name);
    if (!queryText) return [];
    const preferredMatch = normalizePreferredMatch(criteria.preferredMatch);
    const allowAutomaticBinding = criteria.allowAutomaticBinding === true;
    const directoryMatch = allowAutomaticBinding ? normalizePreferredMatch(
      index?.companyBindings?.[cleanText(criteria.companyId)] ?? index?.companyBindings?.[`name:${normalizeCompanyName(criteria.companyName ?? criteria.name)}`]
    ) : null;
    const effectivePreferredMatch = criteria.manualBind ? preferredMatch : directoryMatch ?? preferredMatch;
    const directoryBind = Boolean(!criteria.manualBind && directoryMatch);
    const preferredIndex = effectivePreferredMatch ? index?.storedNameIndex?.get(effectivePreferredMatch.name) : null;
    const exactIndexes = index?.exactNameIndex?.get(queryName) ?? [];
    const candidateIndexes = new Set(exactIndexes);
    if (Number.isInteger(preferredIndex)) candidateIndexes.add(preferredIndex);
    if (exactIndexes.length === 0) {
      const nameHits = /* @__PURE__ */ new Map();
      const queryGrams = searchBigrams(queryName);
      for (const gram of queryGrams) {
        for (const indexValue of index?.nameGramIndex?.get(gram) ?? []) {
          nameHits.set(indexValue, (nameHits.get(indexValue) ?? 0) + 1);
        }
      }
      const minimumNameHits = Math.max(1, Math.floor(queryGrams.length * 0.25));
      for (const [indexValue, hits] of nameHits) {
        if (hits >= minimumNameHits) candidateIndexes.add(indexValue);
      }
    }
    const candidateEntries = candidateIndexes.size ? [...candidateIndexes].map((indexValue) => index.entries[indexValue]) : index?.entries ?? [];
    const ranked = [];
    for (const entry of candidateEntries) {
      const isPreferredEntry = Boolean(
        effectivePreferredMatch && entry.name === effectivePreferredMatch.name
      );
      const exactName = Boolean(queryName && entry.normalizedName === queryName);
      const nameContains = Boolean(
        queryText && (entry.normalizedSearchName.includes(queryText) || queryText.includes(entry.normalizedSearchName))
      );
      const nameScore = exactName ? 1 : nameContains ? 0.9 : calculateNameSimilarity(queryName, entry.normalizedName);
      if (nameScore < 0.22 && !isPreferredEntry) continue;
      const manualBind = Boolean(criteria.manualBind && isPreferredEntry);
      ranked.push({
        entry,
        score: Math.round(nameScore * 100),
        nameRank: exactName ? 0 : nameContains ? 1 : 2,
        nameScore,
        manualBind,
        directoryBind: directoryBind && isPreferredEntry,
        signals: {
          name: Math.round(nameScore * 100)
        }
      });
    }
    return ranked.sort(
      (left, right) => Number(right.manualBind) - Number(left.manualBind) || Number(right.directoryBind) - Number(left.directoryBind) || left.nameRank - right.nameRank || right.nameScore - left.nameScore || left.entry.name.localeCompare(right.entry.name, "ko")
    ).slice(0, Math.max(1, Math.min(5, Number(limit) || 5))).map(({ entry, score, signals, manualBind, directoryBind: directoryBind2 }) => {
      const best = selectBestLocation(
        entry,
        effectivePreferredMatch,
        manualBind || directoryBind2,
        criteria.referenceAddress
      );
      const bestLocation = best.location;
      const change = getSubscriberChange(bestLocation);
      return {
        name: entry.name,
        locations: clone(
          entry.locations.map(({ latest: _latest, ...location }) => location)
        ),
        snapshotCount: entry.locations.reduce(
          (sum, location) => sum + Object.keys(location.months).length,
          0
        ),
        score,
        signals: {
          ...signals,
          address: best.addressScore === null ? null : Math.round(best.addressScore * 100),
          employee: null
        },
        manualBind,
        directoryBind: directoryBind2,
        matchedAddress: bestLocation?.address ?? null,
        latest: bestLocation?.latest ? clone(bestLocation.latest) : null,
        ...change
      };
    });
  }
  function findPensionPoolMatch(poolValue, matchValue, manualBind = false, criteriaValue = {}) {
    const match = normalizePreferredMatch(matchValue);
    const locations = match ? poolValue?.companies?.[match.name] : null;
    if (!match || !Array.isArray(locations)) return null;
    const miniPool = {
      schemaVersion: PENSION_POOL_SCHEMA_VERSION,
      companies: { [match.name]: locations }
    };
    return searchPensionIndex(
      createPensionSearchIndex(miniPool),
      {
        ...criteriaValue,
        name: cleanText(criteriaValue?.name) || match.name,
        referenceAddress: cleanText(criteriaValue?.referenceAddress) || cleanText(criteriaValue?.address) || match.address || void 0,
        preferredMatch: match,
        manualBind
      },
      1
    )[0] ?? null;
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
      sources: Array.isArray(value.sources) ? clone(value.sources) : [],
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
      for (const location of locationsValue) {
        const months = {};
        for (const [monthValue, snapshot] of Object.entries(
          location?.months ?? {}
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
            address: cleanText(location?.address) || null,
            months
          });
        }
      }
      if (locations.length > 0) pool.companies[name] = locations;
    }
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
      let location = locations.find(
        (candidate) => (candidate.address ?? null) === address
      );
      if (!location) {
        location = { address, months: {} };
        locations.push(location);
      }
      location.months[month] = {
        subscribers,
        joined: count(record?.joined, 0),
        left: count(record?.left, 0)
      };
      pool.companies[name] = locations;
    }
    const importedAt = nowIso();
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
  function mergePensionRecords(poolValue, records, source = {}) {
    const pool = normalizePensionPool(poolValue);
    applyPensionRecords(pool, records, source);
    return sortPool(pool);
  }
  function mergePensionRecordBatchesIntoNormalizedPool(pool, batches) {
    for (const batch of batches ?? []) {
      applyPensionRecords(pool, batch.records ?? [], batch.source ?? {});
    }
    return sortPool(pool);
  }
  function mergePensionPools(baseValue, incomingValue) {
    let result = normalizePensionPool(baseValue);
    const incoming = normalizePensionPool(incomingValue);
    const records = [];
    for (const [name, locations] of Object.entries(incoming.companies)) {
      for (const location of locations) {
        for (const [month, snapshot] of Object.entries(location.months)) {
          records.push({ name, address: location.address, month, ...snapshot });
        }
      }
    }
    result = mergePensionRecords(result, records, {
      name: `\uC5F0\uAE08 \uD480 JSON (${incoming.updatedAt})`
    });
    result.sources = [...result.sources, ...incoming.sources];
    result.protectedCompanies = [
      .../* @__PURE__ */ new Set([
        ...result.protectedCompanies ?? [],
        ...incoming.protectedCompanies ?? []
      ])
    ];
    result.companyBindings = {
      ...result.companyBindings,
      ...incoming.companyBindings
    };
    return sortPool(result);
  }
  function filterPensionPoolByCurrentSubscribers(poolValue, minimumCurrentSubscribers = OFFICIAL_PENSION_MIN_CURRENT_SUBSCRIBERS) {
    const pool = normalizePensionPool(poolValue);
    const minimum = Math.max(0, Number(minimumCurrentSubscribers) || 0);
    const protectedNames = new Set(pool.protectedCompanies);
    const companies = {};
    for (const [name, locations] of Object.entries(pool.companies)) {
      const keptLocations = protectedNames.has(name) ? locations : locations.filter((location) => {
        const latestMonth = Object.keys(location.months)[0];
        const subscribers = location.months[latestMonth]?.subscribers;
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
      for (const location of locations) {
        const locationMonths = Object.keys(location.months);
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
  async function loadRawPensionPool() {
    return await get(PENSION_POOL_STORAGE_KEY) ?? createEmptyPensionPool();
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
  function importPensionPoolJson(value, mode = "merge", options = {}) {
    return queuePensionMutation(async () => {
      const incoming = normalizePensionPool(value);
      const current = mode === "replace" ? createEmptyPensionPool() : await loadPensionPool();
      assertRequiredPensionMonth(
        summarizeNormalizedPensionPool(current),
        incoming.sources.map(getPensionSourceMonth),
        options.requiredLatestMonth
      );
      const pool = mode === "replace" ? incoming : mergePensionPools(current, incoming);
      return savePensionPool(pool);
    });
  }

  // src/pension-background-service.js
  var searchIndexPromise = null;
  function invalidatePensionSearchIndex() {
    searchIndexPromise = null;
  }
  async function getSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = loadPensionPool().then(
        createPensionSearchIndexFromNormalizedPool
      );
    }
    return searchIndexPromise;
  }
  async function searchStoredPensionPool(criteria, limit = 30) {
    if (criteria?.preferredMatch?.name && (criteria.manualBind || !criteria.companyId)) {
      const matched = findPensionPoolMatch(
        await loadRawPensionPool(),
        criteria.preferredMatch,
        Boolean(criteria.manualBind),
        criteria
      );
      if (matched) return [matched];
    }
    return searchPensionIndex(await getSearchIndex(), criteria, limit);
  }
  async function listPensionPortalFiles(year, fetchImpl = globalThis.fetch) {
    return fetchPensionPortalFileList(year, fetchImpl);
  }
  async function importPensionPortalFile(file, fetchImpl = globalThis.fetch) {
    const resolved = await resolvePensionPortalDownload(file, fetchImpl);
    if (resolved.requiresPortal) {
      return { ok: false, requiresPortal: true, url: PENSION_PORTAL_DATASET_URL };
    }
    const response = await fetchImpl(resolved.url, {
      cache: "no-store",
      credentials: "include"
    });
    if (!response?.ok) {
      throw new Error(
        `\uACF5\uACF5 CSV \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. (${response?.status ?? "?"})`
      );
    }
    const contentType = String(response.headers?.get?.("content-type") ?? "");
    if (/text\/html/i.test(contentType)) {
      return { ok: false, requiresPortal: true, url: PENSION_PORTAL_DATASET_URL };
    }
    const bytes = await response.arrayBuffer();
    const result = await importPensionCsvFiles(
      [
        {
          name: resolved.name || file?.name || "\uACF5\uACF5\uB370\uC774\uD130 \uAD6D\uBBFC\uC5F0\uAE08.csv",
          sourceUrl: resolved.url,
          pensionSourceMonth: file?.month,
          arrayBuffer: async () => bytes
        }
      ],
      {
        requiredLatestMonth: file?.requiredLatestMonth
      }
    );
    invalidatePensionSearchIndex();
    return {
      ok: true,
      name: resolved.name,
      summary: result.summary,
      diagnostics: result.diagnostics,
      excludedLocationCount: result.excludedLocationCount
    };
  }
  async function importBundledPensionPool(assetUrl, fetchImpl = globalThis.fetch, { mergeExisting = false, replaceExisting = false } = {}) {
    const currentSummary = await loadPensionPoolSummary();
    if (currentSummary.companyCount > 0 && !mergeExisting && !replaceExisting) {
      return { imported: false, summary: currentSummary };
    }
    const response = await fetchImpl(assetUrl, { cache: "no-store" });
    if (!response?.ok) {
      throw new Error(
        `\uB0B4\uC7A5 \uAD6D\uBBFC\uC5F0\uAE08 JSON\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. (${response?.status ?? "?"})`
      );
    }
    const pool = typeof response.json === "function" ? await response.json() : JSON.parse(await response.text());
    const mode = replaceExisting || currentSummary.companyCount === 0 ? "replace" : "merge";
    const result = await importPensionPoolJson(pool, mode);
    invalidatePensionSearchIndex();
    return {
      imported: true,
      merged: mode === "merge",
      replaced: mode === "replace" && currentSummary.companyCount > 0,
      summary: result.summary
    };
  }
  function clearPensionBackgroundCache() {
    invalidatePensionSearchIndex();
    return { ok: true };
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

  // src/update-check.js
  var UPDATE_METADATA_URL = "https://raw.githubusercontent.com/rlaalswns20031010/Hayoung4/main/dist/update.json";
  var UPDATE_RELEASE_URL = "https://github.com/rlaalswns20031010/Hayoung4/releases/latest";
  var UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1e3;
  function parseVersion(value) {
    const match = String(value ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map(Number) : null;
  }
  function compareProductVersions(leftValue, rightValue) {
    const left = parseVersion(leftValue);
    const right = parseVersion(rightValue);
    if (!left || !right) return null;
    for (let index = 0; index < 3; index += 1) {
      if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
    }
    return 0;
  }
  function normalizeUpdateMetadata(value) {
    const version = String(value?.version ?? "").trim();
    if (!parseVersion(version)) return null;
    const releaseUrl = String(value?.releaseUrl ?? UPDATE_RELEASE_URL).trim();
    try {
      const url = new URL(releaseUrl);
      if (url.protocol !== "https:") return null;
    } catch {
      return null;
    }
    return { version, releaseUrl };
  }
  async function checkGithubUpdate({
    currentVersion,
    fetchImpl = globalThis.fetch,
    now = /* @__PURE__ */ new Date()
  } = {}) {
    const checkedAt = new Date(now).toISOString();
    try {
      const response = await fetchImpl(UPDATE_METADATA_URL, {
        cache: "no-store",
        credentials: "omit"
      });
      if (!response?.ok) {
        throw new Error(`Git \uC5C5\uB370\uC774\uD2B8 \uD30C\uC77C \uC694\uCCAD \uC2E4\uD328 (${response?.status ?? "?"})`);
      }
      const metadata = normalizeUpdateMetadata(await response.json());
      const comparison = metadata ? compareProductVersions(metadata.version, currentVersion) : null;
      if (!metadata || comparison === null) {
        throw new Error("Git \uC5C5\uB370\uC774\uD2B8 \uD30C\uC77C\uC758 \uBC84\uC804 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      }
      return {
        status: comparison > 0 ? "available" : "current",
        currentVersion,
        latestVersion: metadata.version,
        releaseUrl: metadata.releaseUrl,
        checkedAt,
        sourceUrl: UPDATE_METADATA_URL
      };
    } catch (error) {
      return {
        status: "unavailable",
        currentVersion,
        latestVersion: null,
        releaseUrl: UPDATE_RELEASE_URL,
        checkedAt,
        sourceUrl: UPDATE_METADATA_URL,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // src/background.js
  var CONTENT_SCRIPT_ID = "hayoung-main";
  var SUPPORTED_MATCHES = Object.freeze([
    "https://jobkorea.co.kr/*",
    "https://*.jobkorea.co.kr/*",
    "https://gamejob.co.kr/*",
    "https://*.gamejob.co.kr/*"
  ]);
  var lastContentReady = null;
  var cachedUpdateStatus = null;
  var updateStatusPromise = null;
  async function getGithubUpdateStatus({ force = false } = {}) {
    const checkedAt = new Date(cachedUpdateStatus?.checkedAt ?? "").getTime();
    if (!force && cachedUpdateStatus && Number.isFinite(checkedAt) && Date.now() - checkedAt < UPDATE_CHECK_INTERVAL_MS) {
      return cachedUpdateStatus;
    }
    if (!updateStatusPromise) {
      updateStatusPromise = checkGithubUpdate({
        currentVersion: chrome.runtime.getManifest().version
      }).then((status) => {
        cachedUpdateStatus = status;
        return status;
      });
    }
    try {
      return await updateStatusPromise;
    } finally {
      updateStatusPromise = null;
    }
  }
  function getAssetPrefix(workerUrl = globalThis.location?.href ?? "") {
    try {
      return new URL(workerUrl).pathname.includes("/dist/background.js") ? "dist/" : "";
    } catch {
      return "";
    }
  }
  function getContentRegistration(workerUrl) {
    const prefix = getAssetPrefix(workerUrl);
    return {
      id: CONTENT_SCRIPT_ID,
      matches: [...SUPPORTED_MATCHES],
      js: [`${prefix}content.js`],
      css: [`${prefix}style.css`],
      runAt: "document_idle",
      persistAcrossSessions: true
    };
  }
  function getExtensionManagementUrl(extensionId) {
    return `chrome://extensions/?id=${encodeURIComponent(extensionId ?? "")}`;
  }
  async function ensureContentRegistration() {
    const registration = getContentRegistration();
    const registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID]
    });
    if (registered.length === 0) {
      await chrome.scripting.registerContentScripts([registration]);
    } else {
      try {
        await chrome.scripting.updateContentScripts([registration]);
      } catch {
        await chrome.scripting.unregisterContentScripts({
          ids: [CONTENT_SCRIPT_ID]
        });
        await chrome.scripting.registerContentScripts([registration]);
      }
    }
    return registration;
  }
  async function getRegistrationStatus() {
    const registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID]
    });
    return {
      ok: true,
      registered: registered.length === 1,
      registration: registered[0] ?? null,
      lastContentReady
    };
  }
  async function initialize() {
    try {
      await ensureContentRegistration();
    } catch (error) {
      console.error("[Hayoung4] \uCF58\uD150\uCE20 \uC2A4\uD06C\uB9BD\uD2B8 \uB4F1\uB85D \uC2E4\uD328", error);
    }
  }
  function respondAsync(operation, sendResponse) {
    operation.then(
      (value) => sendResponse({ ok: true, ...value }),
      (error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );
    return true;
  }
  if (globalThis.chrome?.runtime && globalThis.chrome?.scripting) {
    chrome.runtime.onInstalled.addListener(initialize);
    chrome.runtime.onStartup.addListener(initialize);
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "hayoung:content-ready") {
        lastContentReady = {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          url: sender.url ?? message.url ?? null
        };
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "hayoung:get-registration-status") {
        getRegistrationStatus().then(sendResponse, (error) => {
          sendResponse({ ok: false, error: error.message });
        });
        return true;
      }
      if (message?.type === "hayoung:register-content") {
        ensureContentRegistration().then(async () => sendResponse(await getRegistrationStatus())).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }
      if (message?.type === "hayoung:check-update") {
        return respondAsync(
          getGithubUpdateStatus({ force: Boolean(message.force) }).then(
            (updateStatus) => ({ updateStatus })
          ),
          sendResponse
        );
      }
      if (message?.type === "hayoung:open-extension-management") {
        return respondAsync(
          chrome.tabs.create({ url: getExtensionManagementUrl(chrome.runtime.id) }).then(() => ({ opened: true })),
          sendResponse
        );
      }
      if (message?.type === "hayoung:pension-portal-list") {
        return respondAsync(
          listPensionPortalFiles(message.year).then((files) => ({ files })),
          sendResponse
        );
      }
      if (message?.type === "hayoung:pension-seed") {
        const assetPath = getExtensionAssetPath(
          "assets/pension/pension-pool.json",
          chrome.runtime.getManifest()
        );
        return respondAsync(
          importBundledPensionPool(
            chrome.runtime.getURL(assetPath),
            globalThis.fetch,
            {
              mergeExisting: Boolean(message.mergeExisting),
              replaceExisting: Boolean(message.replaceExisting)
            }
          ),
          sendResponse
        );
      }
      if (message?.type === "hayoung:pension-portal-import") {
        return respondAsync(importPensionPortalFile(message.file), sendResponse);
      }
      if (message?.type === "hayoung:pension-search") {
        return respondAsync(
          searchStoredPensionPool(message.criteria, message.limit).then(
            (results) => ({ results })
          ),
          sendResponse
        );
      }
      if (message?.type === "hayoung:pension-index-invalidate") {
        sendResponse(clearPensionBackgroundCache());
        return false;
      }
      return false;
    });
    void initialize();
  }
})();
