import axios from "axios";
//Conexión central con backend. Aquí encuentras la url base y la instancia configurada de axios
//Si cambiamos de servidor o puerto, solo tocamos este archivo.
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const axiosInstance = axios.create({
  baseURL: API,
});

export default axiosInstance;