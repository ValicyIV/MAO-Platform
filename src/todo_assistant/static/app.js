// -- API helpers -------------------------------------------------------------

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// -- State -------------------------------------------------------------------

let todos = [];

// -- Load & render -----------------------------------------------------------

async function loadTodos() {
  const params = new URLSearchParams();
  const q = document.getElementById("search").value.trim();
  const status = document.getElementById("filter-status").value;
  const priority = document.getElementById("filter-priority").value;
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);

  todos = await api("GET", "/api/todos?" + params.toString());
  render();
}

function render() {
  const list = document.getElementById("todo-list");

  if (todos.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No tasks yet</p>
        <p>Add one above to get started</p>
      </div>`;
    return;
  }

  list.innerHTML = todos.map(t => todoHTML(t)).join("");
}

function todoHTML(t) {
  const checkClass =
    t.status === "done" ? "completed" :
    t.status === "in_progress" ? "in-progress" : "";
  const checkIcon = t.status === "done" ? "&#10003;" : t.status === "in_progress" ? "&#9654;" : "";
  const doneClass = t.status === "done" ? "done" : "";

  let subtasksHTML = "";
  if (t.subtasks && t.subtasks.length > 0) {
    const items = t.subtasks.map(s => {
      const sc = s.status === "done" ? "completed" : "";
      const si = s.status === "done" ? "&#10003;" : "";
      const sd = s.status === "done" ? "done" : "";
      return `
        <div class="subtask-item ${sd}">
          <div class="todo-check ${sc}" onclick="toggleSubtask('${t.id}','${s.id}')">${si}</div>
          <span>${esc(s.title)}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteTodo('${s.id}')" title="Remove">&times;</button>
        </div>`;
    }).join("");
    subtasksHTML = `<div class="subtask-list">${items}</div>`;
  }

  return `
    <div class="todo-item ${doneClass}">
      <div class="todo-check ${checkClass}" onclick="cycleStatus('${t.id}','${t.status}')">${checkIcon}</div>
      <div class="todo-body">
        <div class="todo-title" onclick="openDetail('${t.id}')">${esc(t.title)}</div>
        <div class="todo-meta">
          <span class="badge badge-${t.priority}">${t.priority}</span>
          ${t.category ? `<span class="badge badge-category">${esc(t.category)}</span>` : ""}
          ${t.subtasks && t.subtasks.length ? `<span>${t.subtasks.filter(s=>s.status==="done").length}/${t.subtasks.length} subtasks</span>` : ""}
          ${t.due_date ? `<span>Due: ${t.due_date}</span>` : ""}
        </div>
        ${subtasksHTML}
      </div>
      <div class="todo-actions">
        <button class="btn btn-sm btn-ai" onclick="openAI('${t.id}')" title="AI actions">AI</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTodo('${t.id}')" title="Delete">&times;</button>
      </div>
    </div>`;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// -- CRUD actions ------------------------------------------------------------

async function addTodo(e) {
  e.preventDefault();
  const title = document.getElementById("new-title").value.trim();
  if (!title) return;
  await api("POST", "/api/todos", {
    title,
    description: document.getElementById("new-desc").value.trim(),
    priority: document.getElementById("new-priority").value,
    category: document.getElementById("new-category").value.trim(),
  });
  document.getElementById("new-title").value = "";
  document.getElementById("new-desc").value = "";
  document.getElementById("new-category").value = "";
  document.getElementById("new-priority").value = "medium";
  loadTodos();
}

async function cycleStatus(id, current) {
  const next = current === "todo" ? "in_progress" : current === "in_progress" ? "done" : "todo";
  await api("PATCH", `/api/todos/${id}`, { status: next });
  loadTodos();
}

async function toggleSubtask(parentId, subId) {
  const parent = todos.find(t => t.id === parentId);
  if (!parent) return;
  const sub = parent.subtasks.find(s => s.id === subId);
  if (!sub) return;
  const next = sub.status === "done" ? "todo" : "done";
  await api("PATCH", `/api/todos/${subId}`, { status: next });
  loadTodos();
}

async function deleteTodo(id) {
  await api("DELETE", `/api/todos/${id}`);
  loadTodos();
}

async function clearDone() {
  await api("DELETE", "/api/todos/actions/clear-done");
  loadTodos();
}

// -- Detail modal ------------------------------------------------------------

async function openDetail(id) {
  const t = await api("GET", `/api/todos/${id}`);
  const mc = document.getElementById("modal-content");
  mc.innerHTML = `
    <h2>Edit Task</h2>
    <label>Title</label>
    <input id="edit-title" value="${esc(t.title)}">
    <label>Description</label>
    <textarea id="edit-desc">${esc(t.description)}</textarea>
    <label>Priority</label>
    <select id="edit-priority">
      ${["low","medium","high","urgent"].map(p => `<option value="${p}" ${p===t.priority?"selected":""}>${p}</option>`).join("")}
    </select>
    <label>Status</label>
    <select id="edit-status">
      ${["todo","in_progress","done"].map(s => `<option value="${s}" ${s===t.status?"selected":""}>${s.replace("_"," ")}</option>`).join("")}
    </select>
    <label>Category</label>
    <input id="edit-category" value="${esc(t.category)}">
    <label>Due Date</label>
    <input id="edit-due" type="date" value="${t.due_date || ""}">

    <h3>Subtasks</h3>
    <div id="detail-subtasks">
      ${(t.subtasks||[]).map(s => `<div class="subtask-item ${s.status==="done"?"done":""}"><span>${esc(s.title)}</span></div>`).join("") || "<p style='color:var(--text-dim);font-size:13px'>None yet</p>"}
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input id="new-sub-title" placeholder="Add subtask..." style="flex:1">
      <button class="btn btn-sm btn-primary" onclick="addSubtaskFromDetail('${t.id}')">Add</button>
    </div>

    <div class="btn-row">
      <button class="btn btn-danger" onclick="deleteTodo('${t.id}');closeModal()">Delete</button>
      <button class="btn btn-primary" onclick="saveTodo('${t.id}')">Save</button>
    </div>`;
  openModal();
}

async function saveTodo(id) {
  await api("PATCH", `/api/todos/${id}`, {
    title: document.getElementById("edit-title").value.trim(),
    description: document.getElementById("edit-desc").value.trim(),
    priority: document.getElementById("edit-priority").value,
    status: document.getElementById("edit-status").value,
    category: document.getElementById("edit-category").value.trim(),
    due_date: document.getElementById("edit-due").value || null,
  });
  closeModal();
  loadTodos();
}

async function addSubtaskFromDetail(parentId) {
  const input = document.getElementById("new-sub-title");
  const title = input.value.trim();
  if (!title) return;
  await api("POST", `/api/todos/${parentId}/subtasks`, { title });
  openDetail(parentId);
  loadTodos();
}

// -- AI modal ----------------------------------------------------------------

function openAI(id) {
  const t = todos.find(x => x.id === id);
  const mc = document.getElementById("modal-content");
  mc.innerHTML = `
    <h2>AI Actions: ${esc(t.title)}</h2>

    <div class="ai-section">
      <h3 class="ai-section-title">Assistance</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-ai-assist" onclick="aiAssist('${id}')">Assist Me</button>
        <button class="btn btn-ai-auto" onclick="aiAutoComplete('${id}')">Auto-Complete</button>
      </div>
    </div>

    <div class="ai-section">
      <h3 class="ai-section-title">Tools</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-ai" onclick="aiAction('breakdown','${id}')">Break Down</button>
        <button class="btn btn-ai" onclick="aiAction('priority','${id}')">Suggest Priority</button>
        <button class="btn btn-ai" onclick="aiAction('nextstep','${id}')">Next Step</button>
        <button class="btn btn-ai" onclick="aiAction('category','${id}')">Suggest Category</button>
        <button class="btn btn-ai" onclick="aiAction('rewrite','${id}')">Rewrite Task</button>
      </div>
    </div>

    <div id="ai-result-area"></div>`;
  openModal();
}

async function aiAction(action, id) {
  const area = document.getElementById("ai-result-area");
  area.innerHTML = `<div class="ai-loading">Thinking...</div>`;
  try {
    const data = await api("POST", `/api/ai/${action}/${id}`);
    let extra = "";
    if (action === "breakdown") {
      extra = `<div class="btn-row"><button class="btn btn-primary" onclick="applyBreakdown('${id}')">Add as Subtasks</button></div>`;
    } else if (action === "category") {
      extra = `<div class="btn-row"><button class="btn btn-primary" onclick="applyCategory('${id}','${esc(data.result).replace(/'/g, "\\'")}')">Apply Category</button></div>`;
    } else if (action === "rewrite") {
      extra = `<div class="btn-row"><button class="btn btn-primary" onclick="applyRewrite('${id}')">Apply Rewrite</button></div>`;
    }
    area.innerHTML = `<div class="ai-result">${esc(data.result)}</div>${extra}`;
  } catch (err) {
    area.innerHTML = `<div class="ai-result" style="color:var(--red)">Error: ${esc(err.message)}</div>`;
  }
}

// -- AI Assist & Auto-Complete -----------------------------------------------

async function aiAssist(id) {
  const area = document.getElementById("ai-result-area");
  area.innerHTML = `<div class="ai-loading">Analyzing task and preparing guidance...</div>`;
  try {
    const data = await api("POST", `/api/ai/assist/${id}`);
    area.innerHTML = `
      <div class="ai-result-header">Step-by-Step Guidance</div>
      <div class="ai-result">${esc(data.result)}</div>`;
  } catch (err) {
    area.innerHTML = `<div class="ai-result" style="color:var(--red)">Error: ${esc(err.message)}</div>`;
  }
}

async function aiAutoComplete(id) {
  const area = document.getElementById("ai-result-area");
  area.innerHTML = `
    <div class="ai-loading">
      <div class="ai-agent-status">Agent is working...</div>
      <div class="ai-agent-steps">
        <div class="ai-step pending">Analyzing task</div>
        <div class="ai-step pending">Setting priority & category</div>
        <div class="ai-step pending">Creating subtasks</div>
        <div class="ai-step pending">Organizing workflow</div>
      </div>
    </div>`;

  try {
    const data = await api("POST", `/api/ai/auto-complete/${id}`);
    const a = data.actions;

    // Build action summary
    let actionItems = [];
    if (a.title_rewritten) actionItems.push(`Title updated`);
    if (a.description_set) actionItems.push(`Description set`);
    if (a.priority_set) actionItems.push(`Priority set to ${a.priority_set}`);
    if (a.category_set) actionItems.push(`Category set to "${a.category_set}"`);
    if (a.subtasks_created) actionItems.push(`${a.subtasks_created} subtask(s) created`);
    actionItems.push(`Status set to in-progress`);

    const actionHTML = actionItems.map(item =>
      `<div class="ai-action-item"><span class="ai-action-check">&#10003;</span> ${esc(item)}</div>`
    ).join("");

    area.innerHTML = `
      <div class="ai-result-header">Auto-Complete Results</div>
      <div class="ai-actions-summary">${actionHTML}</div>
      <div class="ai-result">${esc(data.result)}</div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="undoAutoComplete('${id}')">Undo All</button>
        <button class="btn btn-primary" onclick="closeModal();loadTodos()">Done</button>
      </div>`;
  } catch (err) {
    area.innerHTML = `<div class="ai-result" style="color:var(--red)">Error: ${esc(err.message)}</div>`;
  }
}

async function undoAutoComplete(id) {
  // Reload the original task, remove subtasks added by auto-complete, reset status
  // Simple approach: reload and let user manage manually
  const t = await api("GET", `/api/todos/${id}`);
  // Remove all subtasks (they were just created by auto-complete)
  for (const sub of (t.subtasks || [])) {
    await api("DELETE", `/api/todos/${sub.id}`);
  }
  await api("PATCH", `/api/todos/${id}`, { status: "todo" });
  closeModal();
  loadTodos();
}

async function applyBreakdown(parentId) {
  const text = document.querySelector("#ai-result-area .ai-result").textContent;
  const lines = text.split("\n").map(l => l.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean);
  for (const title of lines) {
    await api("POST", `/api/todos/${parentId}/subtasks`, { title });
  }
  closeModal();
  loadTodos();
}

async function applyRewrite(id) {
  const text = document.querySelector("#ai-result-area .ai-result").textContent;
  const titleMatch = text.match(/Title:\s*(.+)/);
  const descMatch = text.match(/Description:\s*(.+)/);
  const updates = {};
  if (titleMatch) updates.title = titleMatch[1].trim();
  if (descMatch) updates.description = descMatch[1].trim();
  if (Object.keys(updates).length > 0) {
    await api("PATCH", `/api/todos/${id}`, updates);
  }
  closeModal();
  loadTodos();
}

async function applyCategory(id, cat) {
  const text = document.querySelector("#ai-result-area .ai-result").textContent.trim();
  await api("PATCH", `/api/todos/${id}`, { category: text });
  closeModal();
  loadTodos();
}

// -- Summary modal -----------------------------------------------------------

async function openSummary() {
  const mc = document.getElementById("modal-content");
  mc.innerHTML = `<h2>Daily Summary</h2><div class="ai-loading">Thinking...</div>`;
  openModal();
  try {
    const data = await api("POST", "/api/ai/summary");
    mc.innerHTML = `<h2>Daily Summary</h2><div class="ai-result">${esc(data.result)}</div>`;
  } catch (err) {
    mc.innerHTML = `<h2>Daily Summary</h2><div class="ai-result" style="color:var(--red)">Error: ${esc(err.message)}</div>`;
  }
}

// -- Chat modal --------------------------------------------------------------

let chatHistory = [];

function openChat() {
  chatHistory = [];
  const mc = document.getElementById("modal-content");
  mc.innerHTML = `
    <h2>Chat with AI</h2>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-row">
      <input id="chat-input" placeholder="Ask about your tasks..." onkeydown="if(event.key==='Enter')sendChat()">
      <button class="btn btn-primary" onclick="sendChat()">Send</button>
    </div>`;
  openModal();
  document.getElementById("chat-input").focus();
}

async function sendChat() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;
  input.value = "";

  chatHistory.push({ role: "user", text: msg });
  renderChat();

  const msgDiv = document.getElementById("chat-messages");
  msgDiv.innerHTML += `<div class="chat-msg ai"><em>Thinking...</em></div>`;
  msgDiv.scrollTop = msgDiv.scrollHeight;

  try {
    const data = await api("POST", "/api/ai/chat", { message: msg });
    chatHistory.push({ role: "ai", text: data.result });
  } catch (err) {
    chatHistory.push({ role: "ai", text: "Error: " + err.message });
  }
  renderChat();
}

function renderChat() {
  const div = document.getElementById("chat-messages");
  div.innerHTML = chatHistory.map(m =>
    `<div class="chat-msg ${m.role}">${esc(m.text)}</div>`
  ).join("");
  div.scrollTop = div.scrollHeight;
}

// -- Modal helpers -----------------------------------------------------------

function openModal() {
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("modal-overlay").classList.remove("open");
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

// -- Init --------------------------------------------------------------------

loadTodos();
