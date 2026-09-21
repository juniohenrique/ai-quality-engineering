export interface UserProperties {
  id: string;
  email: string;
  userName: string;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly userName: string;

  constructor(properties: UserProperties) {
    const id = properties.id.trim();
    const email = properties.email.trim().toLowerCase();
    const userName = properties.userName.trim();

    if (!id) {
      throw new Error("User id is required");
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error("User email is invalid");
    }

    if (!userName) {
      throw new Error("User name is required");
    }

    this.id = id;
    this.email = email;
    this.userName = userName;
  }
}
