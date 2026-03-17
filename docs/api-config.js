(function initLibWiseApiConfig() {
    const STORAGE_KEY = "libwise_api_base";

    function trimTrailingSlash(value) {
        return value.replace(/\/+$/, "");
    }

    function normalizeBaseUrl(value) {
        if (!value) {
            return "";
        }

        const normalized = trimTrailingSlash(String(value).trim());
        if (!normalized) {
            return "";
        }

        if (!/^https?:\/\//i.test(normalized)) {
            throw new Error("API URL must start with http:// or https://");
        }

        return normalized;
    }

    function getStoredBase() {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return "";
        }

        try {
            return normalizeBaseUrl(raw);
        } catch (_) {
            return "";
        }
    }

    function saveBase(base) {
        if (!base) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, normalizeBaseUrl(base));
    }

    function getAutoBase() {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1") {
            return "http://localhost:3000";
        }
        return "";
    }

    function getQueryBase() {
        const param = new URLSearchParams(window.location.search).get("api");
        if (!param) {
            return "";
        }

        const normalized = normalizeBaseUrl(param);
        saveBase(normalized);
        return normalized;
    }

    function getBaseUrl() {
        return getQueryBase() || getStoredBase() || getAutoBase();
    }

    function getDisplayBase() {
        const current = getBaseUrl();
        return current || "same-origin";
    }

    function apiUrl(path) {
        if (/^https?:\/\//i.test(path)) {
            return path;
        }

        const base = getBaseUrl();
        if (!base) {
            return path;
        }

        if (path.startsWith("/")) {
            return `${base}${path}`;
        }

        return `${base}/${path}`;
    }

    window.LibWiseApiConfig = {
        apiUrl,
        getBaseUrl,
        getDisplayBase,
        saveBase,
    };
})();
