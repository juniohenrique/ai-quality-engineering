const jsonRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
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

  userList.replaceChildren(
    ...body.map((user) => {
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
        userMessage.textContent = response.ok
          ? "Usuário excluído."
          : "Não foi possível excluir o usuário.";
        if (response.ok) await loadUsers();
      });
      actions.append(edit, remove);
      row.append(actions);
      return row;
    }),
  );
};

if (userList) loadUsers();

const userForm = document.querySelector('[data-testid="user-form"]');
const initializeUserForm = async () => {
  if (!userForm) return;

  const userId = new URLSearchParams(window.location.search).get("id");
  const userName = document.querySelector('[data-testid="user-name"]');
  const userEmail = document.querySelector('[data-testid="user-email"]');
  const userMessage = document.querySelector('[data-testid="user-message"]');
  const submitButton = document.querySelector('[data-testid="user-save"]');
  const cancelLink = document.querySelector('[data-testid="user-cancel"]');
  const nameError = document.getElementById("user-name-error");
  const emailError = document.getElementById("user-email-error");
  const legend = document.querySelector("legend");

  // Mensagens de validação em português
  const validationMessages = {
    valueMissing: "Campo obrigatório",
    typeMismatch: "E-mail inválido",
    tooShort: "Texto muito curto.",
  };

  // Função para limpar todas as mensagens de erro
  const clearErrors = () => {
    nameError.textContent = "";
    nameError.classList.remove("visible");
    emailError.textContent = "";
    emailError.classList.remove("visible");
    userMessage.textContent = "";
    userMessage.classList.remove("visible", "success", "error");
    userName.setCustomValidity("");
    userEmail.setCustomValidity("");
  };

  // Função para exibir erro de validação em um campo
  const showFieldError = (input, errorElement, message) => {
    errorElement.textContent = message;
    errorElement.classList.add("visible");
    input.setCustomValidity(message);
  };

  // Função para validar campos individualmente
  const validateField = (input, errorElement) => {
    if (input.validity.valid) {
      errorElement.textContent = "";
      errorElement.classList.remove("visible");
      input.setCustomValidity("");
      return true;
    }

    let message = "Campo inválido.";
    if (input.validity.valueMissing) {
      message = validationMessages.valueMissing;
    } else if (input.validity.typeMismatch) {
      message = validationMessages.typeMismatch;
    } else if (input.validity.tooShort) {
      message = validationMessages.tooShort;
    }

    showFieldError(input, errorElement, message);
    return false;
  };

  // Validação em tempo real ao sair do campo
  userName.addEventListener("blur", () => validateField(userName, nameError));
  userEmail.addEventListener("blur", () => validateField(userEmail, emailError));

  // Limpar erros ao digitar
  userName.addEventListener("input", () => {
    if (nameError.classList.contains("visible")) {
      nameError.textContent = "";
      nameError.classList.remove("visible");
      userName.setCustomValidity("");
    }
  });
  userEmail.addEventListener("input", () => {
    if (emailError.classList.contains("visible")) {
      emailError.textContent = "";
      emailError.classList.remove("visible");
      userEmail.setCustomValidity("");
    }
  });

  // Modo edição: carregar dados do usuário
  if (userId) {
    document.querySelector("h1").textContent = "Editar usuário";
    legend.textContent = "Editar informações";

    try {
      const { response, body } = await jsonRequest(`/users/${encodeURIComponent(userId)}`);
      if (response.ok) {
        userName.value = body.name;
        userEmail.value = body.email;
        userName.focus();
      } else {
        userMessage.textContent = body.message || "Não foi possível carregar o usuário.";
        userMessage.classList.add("visible", "error");
      }
    } catch (error) {
      userMessage.textContent = "Erro ao carregar os dados do usuário.";
      userMessage.classList.add("visible", "error");
    }

    cancelLink.href = "/users";
  } else {
    userName.focus();
  }

  // Submit do formulário
  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Limpar erros anteriores
    clearErrors();

    // Validar campos
    const isNameValid = validateField(userName, nameError);
    const isEmailValid = validateField(userEmail, emailError);

    if (!isNameValid || !isEmailValid) {
      // Focar no primeiro campo inválido
      if (!isNameValid) {
        userName.focus();
      } else if (!isEmailValid) {
        userEmail.focus();
      }
      return;
    }

    // Marcar como loading
    submitButton.setAttribute("aria-busy", "true");
    submitButton.disabled = true;
    cancelLink.classList.add("disabled");
    userName.disabled = true;
    userEmail.disabled = true;

    try {
      const { response, body } = await jsonRequest(
        userId ? `/users/${encodeURIComponent(userId)}` : "/users",
        {
          method: userId ? "PUT" : "POST",
          body: JSON.stringify({ email: userEmail.value, name: userName.value }),
        },
      );

      if (response.ok) {
        // Exibir mensagem de sucesso
        userMessage.textContent = userId ? "Usuário atualizado." : "Usuário criado.";
        userMessage.classList.add("visible", "success");

        // Redirecionar após 1.5s
        setTimeout(() => {
          window.location.assign("/users");
        }, 1500);
      } else {
        // Exibir mensagem de erro da API
        userMessage.textContent = body.message || "Erro ao salvar o usuário.";
        userMessage.classList.add("visible", "error");
      }
    } catch (error) {
      userMessage.textContent = "Erro de conexão. Tente novamente.";
      userMessage.classList.add("visible", "error");
    } finally {
      submitButton.setAttribute("aria-busy", "false");
      submitButton.disabled = false;
      cancelLink.classList.remove("disabled");
      userName.disabled = false;
      userEmail.disabled = false;
    }
  });
};

initializeUserForm();
