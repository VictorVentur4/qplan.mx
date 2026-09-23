export const ROLE_USER = "user";
export const ROLE_OWNER = "business_owner";
export const ROLE_ADMIN = "admin";

/** A dónde mandar a cada usuario justo después de iniciar sesión. */
export const landingPathFor = (user) => {
  if (!user) return "/";
  if (user.role === ROLE_ADMIN) return "/admin";
  if (user.role === ROLE_OWNER) return "/negocio";
  return "/";
};

export const ROLE_LABELS = {
  [ROLE_USER]: "Usuario",
  [ROLE_OWNER]: "Dueño de negocio",
  [ROLE_ADMIN]: "Administrador",
};
