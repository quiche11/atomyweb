"use strict";

const DATABASE_PAGE_SIZE = 50;
const SQL_WASM_DIRECTORY =
  "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/";

const elements = {
  file: document.querySelector("#database-file"),
  table: document.querySelector("#table-select"),
  searchForm: document.querySelector("#search-form"),
  search: document.querySelector("#search-input"),
  searchButton: document.querySelector("#search-button"),
  name: document.querySelector("#database-name"),
  count: document.querySelector("#result-count"),
  status: document.querySelector("#status"),
  head: document.querySelector("#table-head"),
  body: document.querySelector("#table-body"),
  previous: document.querySelector("#previous-page"),
  next: document.querySelector("#next-page"),
  page: document.querySelector("#page-indicator"),
};

let database = null;
let currentPage = 0;
let totalRows = 0;

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function runQuery(sql, parameters = []) {
  const statement = database.prepare(sql);
  try {
    statement.bind(parameters);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
  elements.status.hidden = !message;
}

function clearTable() {
  elements.head.replaceChildren();
  elements.body.replaceChildren();
  elements.count.textContent = "";
  elements.page.textContent = "";
}

function setDatabaseControlsEnabled(enabled) {
  elements.table.disabled = !enabled;
  elements.search.disabled = !enabled;
  elements.searchButton.disabled = !enabled;
}

function loadTableNames() {
  return runQuery(
    "SELECT name FROM sqlite_master " +
      "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).map((row) => row.name);
}

function updateTable() {
  if (!database || !elements.table.value) {
    clearTable();
    return;
  }

  const tableName = elements.table.value;
  const quotedTable = quoteIdentifier(tableName);
  const columns = runQuery(`PRAGMA table_info(${quotedTable})`).map(
    (column) => column.name,
  );
  const search = elements.search.value.trim();
  const where = search
    ? ` WHERE ${columns
        .map((column) => `instr(unicode_lower(CAST(${quoteIdentifier(column)} AS TEXT)), unicode_lower(?)) > 0`)
        .join(" OR ")}`
    : "";
  const parameters = search ? columns.map(() => search) : [];

  totalRows = runQuery(
    `SELECT COUNT(*) AS count FROM ${quotedTable}${where}`,
    parameters,
  )[0].count;
  const pageCount = Math.max(1, Math.ceil(totalRows / DATABASE_PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount - 1);
  const rows = runQuery(
    `SELECT * FROM ${quotedTable}${where} LIMIT ? OFFSET ?`,
    [...parameters, DATABASE_PAGE_SIZE, currentPage * DATABASE_PAGE_SIZE],
  );

  const headerRow = document.createElement("tr");
  for (const column of columns) {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = column;
    headerRow.append(header);
  }
  elements.head.replaceChildren(headerRow);

  const bodyRows = rows.map((row) => {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      cell.textContent = row[column] === null ? "—" : String(row[column]);
      tr.append(cell);
    }
    return tr;
  });
  if (bodyRows.length === 0) {
    const tr = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = Math.max(columns.length, 1);
    cell.textContent = "Записей нет";
    tr.append(cell);
    bodyRows.push(tr);
  }
  elements.body.replaceChildren(...bodyRows);
  elements.count.textContent = `Записей: ${totalRows.toLocaleString("ru-RU")}`;
  elements.page.textContent = `Страница ${currentPage + 1} из ${pageCount}`;
  elements.previous.disabled = currentPage === 0;
  elements.next.disabled = currentPage + 1 >= pageCount;
  setStatus("");
}

async function handleFileSelection(file) {
  if (!file) {
    return;
  }

  if (database) {
    database.close();
    database = null;
  }
  clearTable();
  setStatus("Открываю базу данных…");
  setDatabaseControlsEnabled(false);
  let nextDatabase = null;
  try {
    const SQL = await initSqlJs({
      locateFile: (fileName) => `${SQL_WASM_DIRECTORY}${fileName}`,
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    nextDatabase = new SQL.Database(bytes);
    nextDatabase.create_function("unicode_lower", (value) =>
      value === null ? null : String(value).toLocaleLowerCase("ru"),
    );
    const tables = loadTableNamesFrom(nextDatabase);
    if (tables.length === 0) {
      throw new Error("В файле не найдены таблицы базы данных.");
    }

    database = nextDatabase;
    elements.name.textContent = file.name;
    elements.table.replaceChildren(
      ...tables.map((tableName) => {
        const option = document.createElement("option");
        option.value = tableName;
        option.textContent = tableName;
        return option;
      }),
    );
    elements.table.value = tables.includes("users") ? "users" : tables[0];
    elements.search.value = "";
    currentPage = 0;
    setDatabaseControlsEnabled(true);
    updateTable();
  } catch (error) {
    if (nextDatabase) {
      nextDatabase.close();
    }
    database = null;
    elements.name.textContent = "Файл базы не выбран";
    elements.table.replaceChildren(new Option("Не удалось открыть базу", ""));
    setDatabaseControlsEnabled(false);
    setStatus(
      `Не удалось открыть базу данных. Проверьте файл и подключение к библиотеке SQLite. Подробности: ${error.message}`,
      true,
    );
  }
}

function loadTableNamesFrom(targetDatabase) {
  const statement = targetDatabase.prepare(
    "SELECT name FROM sqlite_master " +
      "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  try {
    const names = [];
    while (statement.step()) {
      names.push(statement.getAsObject().name);
    }
    return names;
  } finally {
    statement.free();
  }
}

elements.file.addEventListener("change", (event) => {
  void handleFileSelection(event.currentTarget.files[0]);
});

elements.table.addEventListener("change", () => {
  currentPage = 0;
  updateTable();
});

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  currentPage = 0;
  updateTable();
});

elements.previous.addEventListener("click", () => {
  currentPage -= 1;
  updateTable();
});

elements.next.addEventListener("click", () => {
  currentPage += 1;
  updateTable();
});
