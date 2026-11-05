import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const models = ["user", "deal", "dealStatusHistory", "payment", "blockchainTransaction", "deliveryUpdate", "dispute", "evidence", "notification", "webhookEvent", "walletChallenge"];
const state = Object.fromEntries(models.map((name) => [name, []]));
const defaults = {
    user: { role: "SELLER", walletAddress: null },
    deal: { currency: "USDC", chainId: 84532, paymentAsset: "USDC", buyerId: null, buyerEmail: null, buyerWalletAddress: null, status: "CREATED" },
    payment: { provider: "BASE_SEPOLIA", asset: "USDC", chainId: 84532, status: "PENDING" },
    blockchainTransaction: { status: "SUBMITTED", confirmations: 0 }, dispute: { status: "OPEN" }, notification: { readAt: null },
    webhookEvent: { dealId: null, processedAt: null, processingError: null }, walletChallenge: { usedAt: null },
};
const uniques = {
    user: ["id", "email", "walletAddress"], deal: ["id", "reference", "publicTokenHash", "escrowDealId"],
    payment: ["id", "transactionHash"], blockchainTransaction: ["id", "hash"], dispute: ["id", "dealId"],
    webhookEvent: ["id", "providerEventId"], walletChallenge: ["id", "message"],
};
const dateKeys = new Set(["createdAt", "updatedAt", "expectedDeliveryAt", "resolvedAt", "confirmedAt", "receivedAt", "processedAt", "expiresAt", "usedAt", "readAt", "shippedAt"]);
const filename = resolve(process.env.DATA_FILE || "./data/roqlock.json");
let writes = Promise.resolve();

function revive(key, value) {
    if (value && typeof value === "object" && Object.keys(value).length === 1 && typeof value.$bigint === "string") return BigInt(value.$bigint);
    if (dateKeys.has(key) && typeof value === "string") return new Date(value);
    return value;
}
async function load() {
    try {
        const data = JSON.parse(await readFile(filename, "utf8"), revive);
        for (const name of models) if (Array.isArray(data[name])) state[name] = data[name];
    }
    catch (error) {
        if (error.code !== "ENOENT") throw error;
        await persist();
    }
}
function persist() {
    const save = async () => {
        await mkdir(dirname(filename), { recursive: true });
        const temp = `${filename}.${process.pid}.tmp`;
        const contents = JSON.stringify(state, (_key, value) => typeof value === "bigint" ? { $bigint: value.toString() } : value);
        await writeFile(temp, contents, { mode: 0o600 });
        await rename(temp, filename);
    };
    writes = writes.then(save, save);
    return writes;
}
function equal(actual, expected, mode) {
    if (mode === "insensitive" && typeof actual === "string" && typeof expected === "string") return actual.toLowerCase() === expected.toLowerCase();
    if (actual instanceof Date || expected instanceof Date) return +new Date(actual) === +new Date(expected);
    return actual === expected;
}
function matches(model, row, where = {}) {
    for (const [key, condition] of Object.entries(where)) {
        if (key === "OR") { if (!condition.some((clause) => matches(model, row, clause))) return false; continue; }
        if (key === "AND") { if (!condition.every((clause) => matches(model, row, clause))) return false; continue; }
        if (key === "NOT") { if (matches(model, row, condition)) return false; continue; }
        if ((key === "deal" && model === "dispute") || (key === "deal" && model === "evidence")) {
            const dealId = model === "dispute" ? row.dealId : state.dispute.find((x) => x.id === row.disputeId)?.dealId;
            const relatedDeal = state.deal.find((x) => x.id === dealId);
            if (!relatedDeal || !matches("deal", relatedDeal, condition)) return false;
            continue;
        }
        const actual = row[key];
        if (condition && typeof condition === "object" && !Array.isArray(condition) && !(condition instanceof Date)) {
            if ("equals" in condition && !equal(actual, condition.equals, condition.mode)) return false;
            if ("gt" in condition && !(actual > condition.gt)) return false;
            if ("gte" in condition && !(actual >= condition.gte)) return false;
            if ("lt" in condition && !(actual < condition.lt)) return false;
            if ("in" in condition && !condition.in.includes(actual)) return false;
            if ("not" in condition && equal(actual, condition.not)) return false;
        }
        else if (!equal(actual, condition)) return false;
    }
    return true;
}
function relation(model, row, key, options) {
    let rows = [];
    if (key === "seller") rows = state.user.filter((item) => item.id === row.sellerId);
    else if (key === "buyer") rows = state.user.filter((item) => item.id === row.buyerId);
    else if (key === "deal") {
        const dealId = model === "dispute" ? row.dealId : model === "evidence" ? state.dispute.find((item) => item.id === row.disputeId)?.dealId : row.dealId;
        rows = state.deal.filter((item) => item.id === dealId);
    }
    else if (key === "deliveryUpdates") rows = state.deliveryUpdate.filter((item) => item.dealId === row.id);
    else if (key === "statusHistory") rows = state.dealStatusHistory.filter((item) => item.dealId === row.id);
    else if (key === "payments") rows = state.payment.filter((item) => item.dealId === row.id);
    else if (key === "dispute") rows = state.dispute.filter((item) => item.dealId === row.id);
    else if (key === "evidence") rows = state.evidence.filter((item) => item.disputeId === row.id);
    if (options?.orderBy) {
        const [field, direction] = Object.entries(options.orderBy)[0];
        rows.sort((a, b) => a[field] < b[field] ? (direction === "desc" ? 1 : -1) : a[field] > b[field] ? (direction === "desc" ? -1 : 1) : 0);
    }
    if (options?.take) rows = rows.slice(0, options.take);
    rows = rows.map((item) => materialize(key === "deal" ? (model === "evidence" ? "deal" : "deal") : key, item, options?.include, options?.select));
    const singular = ["seller", "buyer", "deal", "dispute"].includes(key);
    return singular ? rows[0] ?? null : rows;
}
function materialize(model, row, include, select) {
    if (!row) return null;
    const result = { ...row };
    for (const [key, options] of Object.entries(include ?? {})) if (options) result[key] = relation(model, row, key, options === true ? {} : options);
    if (select) return Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, result[key] ?? row[key]]));
    return result;
}
function makeDelegate(model) {
    const rows = () => state[model];
    const ensureUnique = (candidate, exceptId) => {
        for (const field of uniques[model] ?? []) {
            if (candidate[field] != null && rows().some((item) => item.id !== exceptId && equal(item[field], candidate[field], field === "email" ? "insensitive" : undefined))) {
                const error = new Error(`Unique constraint failed: ${field}`); error.code = "P2002"; throw error;
            }
        }
    };
    return {
        async create({ data, include, select }) {
            const attrs = { ...data };
            const nested = [];
            if (model === "deal") for (const field of ["statusHistory", "payments"]) if (attrs[field]?.create) { nested.push([field, attrs[field].create]); delete attrs[field]; }
            const timestamp = new Date();
            const row = { id: randomUUID(), ...(defaults[model] ?? {}), ...attrs, createdAt: attrs.createdAt ?? timestamp, updatedAt: attrs.updatedAt ?? timestamp };
            ensureUnique(row);
            rows().push(row);
            for (const [field, value] of nested) {
                const child = field === "statusHistory" ? "dealStatusHistory" : "payment";
                const childTime = new Date();
                state[child].push({ id: randomUUID(), dealId: row.id, ...(defaults[child] ?? {}), ...value, createdAt: value.createdAt ?? childTime, updatedAt: value.updatedAt ?? childTime });
            }
            await persist();
            return materialize(model, row, include, select);
        },
        async createMany({ data, skipDuplicates = false }) {
            let count = 0;
            for (const attrs of data) {
                const timestamp = new Date();
                const row = { id: randomUUID(), ...(defaults[model] ?? {}), ...attrs, createdAt: attrs.createdAt ?? timestamp, updatedAt: attrs.updatedAt ?? timestamp };
                try { ensureUnique(row); rows().push(row); count++; }
                catch (error) { if (!skipDuplicates) throw error; }
            }
            if (count) await persist();
            return { count };
        },
        async findUnique({ where, include, select }) { return materialize(model, rows().find((row) => matches(model, row, where)), include, select); },
        async findFirst({ where, include, select, orderBy }) {
            const found = rows().filter((row) => matches(model, row, where));
            if (orderBy) {
                const [field, direction] = Object.entries(orderBy)[0];
                found.sort((a, b) => a[field] < b[field] ? (direction === "desc" ? 1 : -1) : a[field] > b[field] ? (direction === "desc" ? -1 : 1) : 0);
            }
            return materialize(model, found[0], include, select);
        },
        async findMany({ where, include, select, orderBy, take } = {}) {
            let found = rows().filter((row) => matches(model, row, where));
            if (orderBy) {
                const [field, direction] = Object.entries(orderBy)[0];
                found.sort((a, b) => a[field] < b[field] ? (direction === "desc" ? 1 : -1) : a[field] > b[field] ? (direction === "desc" ? -1 : 1) : 0);
            }
            if (take) found = found.slice(0, take);
            return found.map((row) => materialize(model, row, include, select));
        },
        async update({ where, data, include, select }) {
            const row = rows().find((item) => matches(model, item, where));
            if (!row) { const error = new Error("Record not found"); error.code = "P2025"; throw error; }
            const candidate = { ...row, ...data, updatedAt: new Date() };
            ensureUnique(candidate, row.id);
            Object.assign(row, candidate);
            await persist();
            return materialize(model, row, include, select);
        },
        async updateMany({ where, data }) {
            let count = 0;
            for (const row of rows()) if (matches(model, row, where)) { Object.assign(row, data); if ("updatedAt" in row) row.updatedAt = new Date(); count++; }
            if (count) await persist();
            return { count };
        },
    };
}

await load();
export const store = Object.fromEntries(models.map((name) => [name, makeDelegate(name)]));
store.$transaction = async (callback) => {
    const snapshot = structuredClone(state);
    try { return await callback(store); }
    catch (error) { for (const name of models) state[name] = snapshot[name]; await persist(); throw error; }
};
store.$ping = async () => { await persist(); return true; };
store.$disconnect = async () => writes;
