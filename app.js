import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://pyljspqiwmbjenxjfcgk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qw745bHXzFA5G_sZPCTkVA_gWPFZOnA";
const PAGE_SIZE = 50;

const TABLES = {
  users: {
    label: "Пользователи",
    columns: [
      "id",
      "username",
      "first_name",
      "last_name",
      "language_code",
      "is_bot",
      "is_admin",
      "registered_at",
      "total_messages",
    ],
    searchText: ["username", "first_name", "last_name", "language_code"],
    searchNumber: ["id"],
    orderBy: "id",
  },
  admins: {
    label: "Администраторы",
    columns: ["id", "added_at"],
    searchNumber: ["id"],
    orderBy: "id",
  },
  support_requests: {
    label: "Обращения",
    columns: ["id", "user_id", "created_at", "answered", "admin_ids"],
    searchText: ["id"],
    searchNumber: ["user_id"],
    orderBy: "created_at",
    ascending: false,
  },
  bot_settings: {
    label: "Настройки бота",
    columns: ["key", "value"],
    searchText: ["key", "value"],
    orderBy: "key",
  },
  user_topics: {
    label: "Темы пользователей",
    columns: ["user_id", "chat_id", "message_thread_id"],
    searchNumber: ["user_id", "chat_id"],
    orderBy: "user_id",
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const elements = {
  loginPanel: document.querySelector("#login-panel"),
  loginForm: document.querySelector("#login-form"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  signOut: document.querySelector("#sign-out"),
  dashboard: document.querySelector("#dashboard"),
  table: document.querySelector("#table-select"),
  searchForm: document.querySelector("#search-form"),
  search: document.querySelector("#search-input"),
  tableLabel: document.querySelector("#table-label"),
  resultCount: document.querySelector("#result-count"),
  status: document.querySelector("#status"),
  appStatus: document.querySelector("#app-status"),
  tableHead: document.querySelector("#table-head"),
  tableBody: document.querySelector("#table-body"),
  previous: document.querySelector("#previous-page"),
  next: document.querySelector("#next-page"),
  page: document.querySelector("#page-indicator"),
};

let currentPage = 0;
let requestVersion = 0;

function showAppStatus(message, isError = false) {
  elements.appStatus.textContent = message;
  elements.appStatus.classList.toggle("error", isError);
}

function showTableStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
  elements.status.hidden = !message;
}

function clearTable() {
  elements.tableHead.replaceChildren();
  elements.tableBody.replaceChildren();
  elements.resultCount.textContent = "";
  elements.page.textContent = "";
}

function escapeSearchText(value) {
  return value
    .replace(/[^\p{L}\p{N} @._+-]/gu, "")
    .trim()
    .slice(0, 100);
}

function applySearch(query, tableInfo, search) {
  if (!search) {
    return query;
  }

  const clauses = tableInfo.searchText.map(
    (column) => `${column}.ilike."%${search}%"`,
  );
  const numericColumns = tableInfo.searchNumber || [];
  if (/^\d+$/.test(search)) {
    clauses.push(...numericColumns.map((column) => `${column}.eq.${search}`));
  }
  if (/^[\da-f-]+$/i.test(search) && tableInfo.searchText.includes("id")) {
    clauses.push(`id.eq.${search}`);
  }
  return clauses.length ? query.or(clauses.join(",")) : query;
}

function renderRows(columns, rows) {
  const header = document.createElement("tr");
  for (const column of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    header.append(cell);
  }
  elements.tableHead.replaceChildren(header);

  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columns.length;
    cell.textContent = "Записей нет";
    row.append(cell);
    elements.tableBody.replaceChildren(row);
    return;
  }

  const renderedRows = rows.map((data) => {
    const row = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      const value = data[column];
      cell.textContent =
        value === null || value === undefined
          ? "—"
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      row.append(cell);
    }
    return row;
  });
  elements.tableBody.replaceChildren(...renderedRows);
}

async function loadTable() {
  const version = ++requestVersion;
  const tableName = elements.table.value;
  const tableInfo = TABLES[tableName];
  if (!tableInfo) {
    return;
  }

  clearTable();
  showTableStatus("Загружаю данные…");
  elements.previous.disabled = true;
  elements.next.disabled = true;
  elements.tableLabel.textContent = tableInfo.label;

  const search = escapeSearchText(elements.search.value);
  if (
    search &&
    tableInfo.searchText.length === 0 &&
    !/^\d+$/.test(search)
  ) {
    showTableStatus("Для поиска в этой таблице введите числовой ID.");
    elements.resultCount.textContent = "";
    elements.page.textContent = "";
    return;
  }
  let query = supabase
    .from(tableName)
    .select("*", { count: "exact" })
    .order(tableInfo.orderBy, { ascending: tableInfo.ascending ?? true });
  query = applySearch(query, tableInfo, search);

  const start = currentPage * PAGE_SIZE;
  const { data, error, count } = await query.range(start, start + PAGE_SIZE - 1);
  if (version !== requestVersion) {
    return;
  }
  if (error) {
    showTableStatus(`Не удалось загрузить таблицу: ${error.message}`, true);
    showAppStatus("Проверьте схему таблиц и настройки RLS в Supabase.", true);
    return;
  }

  const columns = tableInfo.columns.filter(
    (column) => data.length === 0 || column in data[0],
  );
  renderRows(columns, data);
  const total = count || 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  elements.resultCount.textContent = `Записей: ${total.toLocaleString("ru-RU")}`;
  elements.page.textContent = `Страница ${currentPage + 1} из ${pageCount}`;
  elements.previous.disabled = currentPage === 0;
  elements.next.disabled = currentPage + 1 >= pageCount;
  showTableStatus("");
  showAppStatus("");
}

async function showDashboard(session) {
  elements.loginPanel.hidden = true;
  elements.dashboard.hidden = true;
  elements.signOut.hidden = false;
  showAppStatus("Проверяю доступ к панели…");

  const { data, error } = await supabase
    .from("dashboard_access")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) {
    elements.signOut.hidden = true;
    elements.loginPanel.hidden = false;
    showAppStatus(
      `Не удалось проверить доступ. Настройте таблицу dashboard_access и RLS в Supabase: ${error.message}`,
      true,
    );
    return;
  }
  if (!data) {
    await supabase.auth.signOut();
    elements.signOut.hidden = true;
    elements.loginPanel.hidden = false;
    showAppStatus("У этой учетной записи нет доступа к панели.", true);
    return;
  }

  elements.dashboard.hidden = false;
  elements.table.replaceChildren(
    ...Object.entries(TABLES).map(([name, info]) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = info.label;
      return option;
    }),
  );
  elements.table.value = "users";
  currentPage = 0;
  await loadTable();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAppStatus("Выполняется вход…");
  const { error } = await supabase.auth.signInWithPassword({
    email: elements.email.value.trim(),
    password: elements.password.value,
  });
  if (error) {
    showAppStatus(`Не удалось войти: ${error.message}`, true);
    return;
  }
  elements.password.value = "";
});

elements.signOut.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showAppStatus(`Не удалось выйти: ${error.message}`, true);
    return;
  }
  elements.dashboard.hidden = true;
  elements.signOut.hidden = true;
  elements.loginPanel.hidden = false;
  clearTable();
  showAppStatus("Вы вышли из панели.");
});

elements.table.addEventListener("change", () => {
  currentPage = 0;
  void loadTable();
});

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  currentPage = 0;
  void loadTable();
});

elements.previous.addEventListener("click", () => {
  currentPage -= 1;
  void loadTable();
});

elements.next.addEventListener("click", () => {
  currentPage += 1;
  void loadTable();
});

supabase.auth.onAuthStateChange((_event, session) => {
  window.setTimeout(() => {
    if (session) {
      void showDashboard(session);
    } else {
      elements.dashboard.hidden = true;
      elements.signOut.hidden = true;
      elements.loginPanel.hidden = false;
    }
  }, 0);
});
