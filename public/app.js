const jsonRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body };
};

const loginForm = document.querySelector('[data-testid="login-form"]');
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(loginForm);
    const { response, body } = await jsonRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });

    if (!response.ok) {
      document.querySelector('[data-testid="login-message"]').textContent = body.message;
      return;
    }

    localStorage.setItem("auth_token", body.token);
    window.location.assign("/users");
  });
}

const userList = document.querySelector('[data-testid="user-list"]');
const userMessage = document.querySelector('[data-testid="user-message"]');

const loadUsers = async () => {
  const { response, body } = await jsonRequest("/users");
  if (!response.ok) {
    userMessage.textContent = "Não foi possível carregar os usuários.";
    return;
  }

  userList.replaceChildren(...body.map((user) => {
    const row = document.createElement("tr");
    row.dataset.testid = "user-row";
    row.dataset.userId = user.id;
    row.innerHTML = `<td>${user.name}</td><td>${user.email}</td>`;
    const actions = document.createElement("td");
    const edit = document.createElement("a");
    edit.dataset.testid = `user-edit-${user.id}`;
    edit.href = `/user-form?id=${encodeURIComponent(user.id)}`;
    edit.textContent = "Editar";
    const remove = document.createElement("button");
    remove.dataset.testid = `user-delete-${user.id}`;
    remove.type = "button";
    remove.textContent = "Excluir";
    remove.addEventListener("click", async () => {
      if (!window.confirm("Excluir este usuário?")) return;
      const { response } = await jsonRequest(`/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      userMessage.textContent = response.ok ? "Usuário excluído." : "Não foi possível excluir o usuário.";
      if (response.ok) await loadUsers();
    });
    actions.append(edit, remove);
    row.append(actions);
    return row;
  }));
};

if (userList) loadUsers();

const userForm = document.querySelector('[data-testid="user-form"]');
const initializeUserForm = async () => {
  if (!userForm) return;

  const userId = new URLSearchParams(window.location.search).get("id");
  const userName = document.querySelector('[data-testid="user-name"]');
  const userEmail = document.querySelector('[data-testid="user-email"]');
  const userMessage = document.querySelector('[data-testid="user-message"]');
  const cancelLink = document.querySelector('[data-testid="user-cancel"]');
  if (userId) {
    document.querySelector("h1").textContent = "Editar usuário";
    const { response, body } = await jsonRequest(`/users/${encodeURIComponent(userId)}`);
    if (response.ok) {
      userName.value = body.name;
      userEmail.value = body.email;
    }
    cancelLink.href = "/users";
  }

  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(userForm);
    const { response, body } = await jsonRequest(userId ? `/users/${encodeURIComponent(userId)}` : "/users", {
      method: userId ? "PUT" : "POST",
      body: JSON.stringify({ email: form.get("email"), name: form.get("name") }),
    });
    userMessage.textContent = response.ok ? (userId ? "Usuário atualizado." : "Usuário criado.") : body.message;
    if (response.ok) window.location.assign("/users");
  });
};

initializeUserForm();
