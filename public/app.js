const jsonRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body };
};

// ======================== HELPERS GLOBAIS ========================

const setLoading = (button, isLoading, loadingText = "Enviando...") => {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = loadingText;
    button.setAttribute("aria-busy", "true");
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || "";
    button.removeAttribute("aria-busy");
  }
};

const showMessage = (element, message, type = "error") => {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("visible", "success", "error");
  element.classList.add("visible", type);
};

const clearMessage = (element) => {
  if (!element) return;
  element.classList.remove("visible", "success", "error");
  element.textContent = "";
};

const getAccessToken = () => localStorage.getItem("auth_access_token");

const getRefreshToken = () => localStorage.getItem("auth_refresh_token");

const clearTokens = () => {
  localStorage.removeItem("auth_access_token");
  localStorage.removeItem("auth_refresh_token");
};

const requireAuth = () => {
  if (!getAccessToken()) {
    window.location.assign("/login.html");
    return false;
  }
  return true;
};

const fetchWithAuth = async (path, options = {}) => {
  const headers = { ...options.headers };
  if (getAccessToken() && !headers.Authorization) {
    headers.Authorization = `Bearer ${getAccessToken()}`;
  }
  const { response, body } = await jsonRequest(path, { ...options, headers });

  if (response.status === 401) {
    clearTokens();
    window.location.assign("/login.html");
    throw new Error("Sessão expirada");
  }

  return { response, body };
};

// ======================== TELA DE LOGIN ========================

const loginForm = document.querySelector('[data-testid="login-form"]');
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = loginForm.querySelector('[data-testid="login-submit"]');
    const msgEl = document.querySelector('[data-testid="login-message"]');
    clearMessage(msgEl);

    setLoading(submitBtn, true, "Entrando...");

    try {
      const form = new FormData(loginForm);
      const { response, body } = await jsonRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });

      if (!response.ok) {
        showMessage(msgEl, body.message, "error");
        return;
      }

      if (!body?.accessToken) {
        showMessage(msgEl, "Resposta inválida do servidor.", "error");
        return;
      }

      clearTokens();
      localStorage.setItem("auth_access_token", body.accessToken);
      localStorage.setItem("auth_refresh_token", body.refreshToken);
      window.location.assign("/users");
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

// ======================== TELA DE RECUPERACAO DE SENHA ========================

const forgotForm = document.querySelector('[data-testid="forgot-form"]');
if (forgotForm) {
  forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = forgotForm.querySelector('[data-testid="forgot-submit"]');
    const messageEl = document.querySelector('[data-testid="forgot-message"]');
    const form = new FormData(forgotForm);

    setLoading(submitBtn, true, "Enviando...");
    try {
      const { response } = await jsonRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email") }),
      });

      // Sempre 204 em sucesso; se falhou por validacao (400), mensagem generica.
      if (response.status === 204) {
        showMessage(
          messageEl,
          "Se o e-mail existir, você receberá um link de recuperação em instantes.",
          "success",
        );
        forgotForm.reset();
      } else {
        showMessage(
          messageEl,
          "Não foi possível processar sua solicitação. Tente novamente.",
          "error",
        );
      }
    } catch {
      showMessage(messageEl, "Erro de conexão. Tente novamente.", "error");
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

// ======================== TELA DE REDEFINICAO DE SENHA ========================

const resetForm = document.querySelector('[data-testid="reset-form"]');
if (resetForm) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  // Se nao tem token na URL -> mensagem de erro e desabilitar form
  if (!token) {
    showMessage(
      document.querySelector('[data-testid="reset-message"]'),
      "Link inválido ou expirado. Solicite um novo.",
      "error",
    );
    const btn = resetForm.querySelector('[data-testid="reset-submit"]');
    if (btn) btn.disabled = true;
  } else {
    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = resetForm.querySelector('[data-testid="reset-submit"]');
      const messageEl = document.querySelector('[data-testid="reset-message"]');
      const form = new FormData(resetForm);
      const newPassword = form.get("newPassword");
      const confirm = form.get("confirmPassword");

      if (newPassword !== confirm) {
        showMessage(messageEl, "As senhas não coincidem.", "error");
        return;
      }
      if (typeof newPassword !== "string" || newPassword.length < 8) {
        showMessage(messageEl, "A senha deve ter pelo menos 8 caracteres.", "error");
        return;
      }

      setLoading(submitBtn, true, "Redefinindo...");
      try {
        const { response, body } = await jsonRequest("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, newPassword }),
        });

        if (response.status === 204) {
          showMessage(
            messageEl,
            "Senha redefinida com sucesso. Redirecionando para o login...",
            "success",
          );
          setTimeout(() => window.location.assign("/login.html"), 1500);
        } else {
          showMessage(
            messageEl,
            body?.message || "Link inválido ou expirado. Solicite um novo.",
            "error",
          );
        }
      } catch {
        showMessage(messageEl, "Erro de conexão. Tente novamente.", "error");
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }
}

// ======================== TELA DE USERS ========================

const userList = document.querySelector('[data-testid="user-list"]');
const userMessage = document.querySelector('[data-testid="user-message"]');

if (userList && !requireAuth()) {
  /* redirecionado para /login.html */
} else if (userList) {
  // Removida showUserMessage local — agora usamos o helper global showMessage
  const deleteUser = async (event) => {
    const deleteButton = event.target.closest(".action-link.danger");
    if (!deleteButton || !userList.contains(deleteButton)) return;

    event.preventDefault();

    const userId = deleteButton.dataset.userId;
    const userName = deleteButton.dataset.userName;
    if (
      !userId ||
      !userName ||
      !window.confirm(`Tem certeza que deseja excluir o usuário ${userName}?`)
    ) {
      return;
    }

    const originalText = deleteButton.textContent;
    setLoading(deleteButton, true, "Excluindo...");

    try {
      const { response, body } = await fetchWithAuth(`/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        showMessage(userMessage, body?.message || "Não foi possível excluir o usuário.", "error");
        return;
      }

      deleteButton.closest("tr").remove();
      showMessage(userMessage, "Usuário excluído.", "success");

      if (!userList.querySelector("tr")) {
        userList.innerHTML =
          '<tr><td class="empty-state" colspan="3">Nenhum usuário cadastrado</td></tr>';
      }
    } catch {
      showMessage(userMessage, "Erro de conexão. Tente novamente.", "error");
    } finally {
      setLoading(deleteButton, false);
    }
  };

  const loadUsers = async () => {
    const { response, body } = await fetchWithAuth("/users");
    if (!response.ok) {
      showMessage(userMessage, "Não foi possível carregar os usuários.", "error");
      return;
    }

    userList.replaceChildren(
      ...body.map((user) => {
        const row = document.createElement("tr");
        row.dataset.testid = "user-row";
        row.dataset.userId = user.id;
        row.innerHTML = `<td>${user.userName}</td><td>${user.email}</td>`;
        const actions = document.createElement("td");
        const edit = document.createElement("a");
        edit.dataset.testid = `user-edit-${user.id}`;
        edit.className = "action-link";
        edit.href = `/user-form?id=${encodeURIComponent(user.id)}`;
        edit.textContent = "Editar";
        const remove = document.createElement("button");
        remove.dataset.testid = `user-delete-${user.id}`;
        remove.dataset.userId = user.id;
        remove.dataset.userName = user.userName;
        remove.className = "action-link danger";
        remove.type = "button";
        remove.textContent = "Excluir";
        actions.append(edit, remove);
        row.append(actions);
        return row;
      }),
    );
  };

  userList.addEventListener("click", deleteUser);
  loadUsers();
}

// ======================== TELA DE USER-FORM ========================

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
    clearMessage(userMessage);
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
      const { response, body } = await fetchWithAuth(`/users/${encodeURIComponent(userId)}`);
      if (response.ok) {
        userName.value = body.userName;
        userEmail.value = body.email;
        userName.focus();
      } else {
        showMessage(userMessage, body.message || "Não foi possível carregar o usuário.", "error");
      }
    } catch (error) {
      showMessage(userMessage, "Erro ao carregar os dados do usuário.", "error");
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
    setLoading(submitButton, true, "Salvando...");
    cancelLink.classList.add("disabled");
    userName.disabled = true;
    userEmail.disabled = true;

    try {
      const { response, body } = await fetchWithAuth(
        userId ? `/users/${encodeURIComponent(userId)}` : "/users",
        {
          method: userId ? "PUT" : "POST",
          body: JSON.stringify({ email: userEmail.value, userName: userName.value }),
        },
      );

      if (response.ok) {
        // Exibir mensagem de sucesso
        clearMessage(userMessage);
        showMessage(
          userMessage,
          userId ? "Usuário atualizado." : "Usuário criado.",
          "success",
        );

        // Redirecionar após 1.5s
        setTimeout(() => {
          window.location.assign("/users");
        }, 1500);
      } else {
        // Exibir mensagem de erro da API
        showMessage(userMessage, body.message || "Erro ao salvar o usuário.", "error");
      }
    } catch (error) {
      showMessage(userMessage, "Erro de conexão. Tente novamente.", "error");
    } finally {
      setLoading(submitButton, false);
      cancelLink.classList.remove("disabled");
      userName.disabled = false;
      userEmail.disabled = false;
    }
  });
};

initializeUserForm();
