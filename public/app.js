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

const userForm = document.querySelector('[data-testid="user-form"]');
const userList = document.querySelector('[data-testid="user-list"]');
const userMessage = document.querySelector('[data-testid="user-message"]');

const loadUsers = async () => {
  const { response, body } = await jsonRequest("/users");
  if (!response.ok) {
    userMessage.textContent = "Não foi possível carregar os usuários.";
    return;
  }

  userList.replaceChildren(...body.map((user) => {
    const item = document.createElement("li");
    item.dataset.testid = `user-item-${user.id}`;
    item.textContent = `${user.name} (${user.email})`;
    return item;
  }));
};

if (userForm) {
  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(userForm);
    const { response, body } = await jsonRequest("/users", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), name: form.get("name") }),
    });
    userMessage.textContent = response.ok ? "Usuário criado." : body.message;
    if (response.ok) {
      userForm.reset();
      await loadUsers();
    }
  });
  document.querySelector('[data-testid="user-refresh"]').addEventListener("click", loadUsers);
  loadUsers();
}
