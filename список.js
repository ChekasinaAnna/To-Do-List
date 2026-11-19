"use strict";

const demoMode = new URLSearchParams(window.location.search).has("demo");
const storageKey = demoMode ? "list-del:demo:v1" : "list-del:tasks:v1";
const demoTasks = [
  { id: "demo-source", title: "Проверить исходники", done: true },
  { id: "demo-cover", title: "Подготовить обложку проекта", done: false },
  { id: "demo-mobile", title: "Проверить вёрстку на телефоне", done: false },
];

const form = document.querySelector("#task-form");
const field = document.querySelector("#task-title");
const error = document.querySelector("#task-error");
const activeGroup = document.querySelector("#active-group");
const activeList = document.querySelector("#active-list");
const completedGroup = document.querySelector("#completed-group");
const completedList = document.querySelector("#completed-list");
const completedHeading = document.querySelector("#completed-heading");
const template = document.querySelector("#task-template");
const empty = document.querySelector("#empty-state");
const completion = document.querySelector("#completion");
const completionLabel = document.querySelector("#completion-label");
const completionBar = document.querySelector("#completion-bar");
const notice = document.querySelector("#delete-notice");
const undoButton = document.querySelector("#undo-delete");
const closeButton = document.querySelector("#close-notice");
const status = document.querySelector("#status-message");
const storageWarning = document.querySelector("#storage-warning");

let tasks = restore();
let lastDeletion = null;

function showStorageWarning(message) {
  storageWarning.textContent = message;
  storageWarning.hidden = !message;
}

function restore() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      const rows = JSON.parse(saved);
      if (!Array.isArray(rows)) throw new TypeError("Ожидался список задач");

      const seen = new Set();
      return rows.filter((row) => {
        if (!row || typeof row.id !== "string" || typeof row.title !== "string" ||
            !row.title.trim() || typeof row.done !== "boolean" || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
    }
  } catch {
    showStorageWarning("Не удалось загрузить сохранённые задачи.");
  }

  return demoMode ? demoTasks.map((task) => ({ ...task })) : [];
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    showStorageWarning("");
  } catch {
    showStorageWarning("Сохранить задачи не удалось. Изменения доступны до обновления страницы.");
  }
}

function announce(message) {
  status.textContent = message;
}

function updateListStatus() {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  const allDone = total > 0 && done === total;

  empty.hidden = total > 0;
  activeGroup.hidden = done === total;
  completedGroup.hidden = done === 0;
  completedHeading.textContent = "Выполнено · " + done;
  completion.hidden = total === 0;
  completion.classList.toggle("is-complete", allDone);
  completionLabel.textContent = allDone ? "Всё выполнено" : done + " из " + total + " выполнено";
  completionBar.max = Math.max(1, total);
  completionBar.value = done;
}

function taskList(task) {
  return task.done ? completedList : activeList;
}

function placeTaskRow(task, row) {
  const index = tasks.indexOf(task);
  const next = tasks.find((item, position) => position > index && item.done === task.done);
  const nextRow = next ? document.getElementById("task-" + next.id) : null;
  taskList(task).insertBefore(row, nextRow);
}

function createTaskRow(task) {
  const row = template.content.firstElementChild.cloneNode(true);
  const checkbox = row.querySelector("input");
  const remove = row.querySelector(".delete-button");

  row.id = "task-" + task.id;
  checkbox.checked = task.done;
  row.querySelector(".task-title").textContent = task.title;
  remove.setAttribute("aria-label", "Удалить задачу «" + task.title + "»");

  checkbox.addEventListener("change", () => {
    const focused = document.activeElement === checkbox;
    const byKeyboard = checkbox.matches(":focus-visible");
    const neighbor = row.nextElementSibling ?? row.previousElementSibling;
    task.done = checkbox.checked;
    placeTaskRow(task, row);
    persist();
    updateListStatus();
    if (focused) focusTaskRow((neighbor ?? row).id, !byKeyboard);
    announce("Задача «" + task.title + (task.done ? "» перенесена в выполненные." : "» возвращена в работу."));
  });

  remove.addEventListener("click", (event) => deleteTask(task.id, event.detail === 0));
  return row;
}

function setFieldError(invalid) {
  error.hidden = !invalid;
  if (invalid) {
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", error.id);
  } else {
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
  }
}

function focusTaskRow(rowId, preventScroll = false) {
  const row = rowId && document.getElementById(rowId);
  const target = row ? row.querySelector("input") : field;
  target.focus({ preventScroll });
}

function showNotice(visible) {
  notice.hidden = !visible;
  document.documentElement.classList.toggle("notice-open", visible);
}

function deleteTask(id, viaKeyboard) {
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) return;

  const task = tasks[index];
  const row = document.getElementById("task-" + id);
  const otherList = task.done ? activeList : completedList;
  const neighbor = row.nextElementSibling ?? row.previousElementSibling ?? otherList.firstElementChild;
  lastDeletion = {
    task,
    index,
    previousId: tasks[index - 1]?.id,
    nextId: tasks[index + 1]?.id,
    focusRowId: neighbor?.id,
  };

  tasks.splice(index, 1);
  row.remove();
  persist();
  updateListStatus();
  showNotice(true);
  announce("Задача «" + lastDeletion.task.title + "» удалена. Доступна отмена.");

  if (viaKeyboard) focusTaskRow(lastDeletion.focusRowId);
}

function undoDeletion() {
  if (!lastDeletion) return;
  const { task, index, nextId, previousId } = lastDeletion;
  const nextIndex = tasks.findIndex((item) => item.id === nextId);
  const previousIndex = tasks.findIndex((item) => item.id === previousId);
  let position = Math.min(index, tasks.length);
  if (nextIndex >= 0) {
    position = nextIndex;
  } else if (previousIndex >= 0) {
    position = previousIndex + 1;
  }

  tasks.splice(position, 0, task);
  placeTaskRow(task, createTaskRow(task));
  lastDeletion = null;
  showNotice(false);
  persist();
  updateListStatus();
  announce("Задача «" + task.title + "» восстановлена.");
  focusTaskRow("task-" + task.id);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = field.value.trim();
  if (!title) {
    setFieldError(true);
    field.focus();
    announce(error.textContent);
    return;
  }

  const id = crypto.randomUUID?.() ?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  const task = { id, title, done: false };
  tasks.unshift(task);
  activeList.prepend(createTaskRow(task));
  field.value = "";
  setFieldError(false);
  persist();
  updateListStatus();
  field.focus();
  announce("Задача «" + title + "» добавлена.");
});

field.addEventListener("input", () => {
  if (!error.hidden && field.value.trim()) setFieldError(false);
});

undoButton.addEventListener("click", undoDeletion);
closeButton.addEventListener("click", () => {
  const target = lastDeletion?.focusRowId;
  lastDeletion = null;
  showNotice(false);
  focusTaskRow(target);
});

for (const task of tasks) {
  taskList(task).append(createTaskRow(task));
}
updateListStatus();
