import axios from 'axios';

export const TOKEN_KEY = 'ra_token';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };

const api = axios.create({ baseURL: API_URL, timeout: 20000 });

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event('ra:logout'));
    }
    return Promise.reject(err);
  }
);

/** Friendly error text from any axios error. */
export const errMsg = (e) => {
  const d = e?.response?.data;
  if (d?.errors?.length) return d.errors.map((x) => x.message || x).join(', ');
  return d?.message || (e?.code === 'ECONNABORTED' ? 'The server took too long to respond' : e?.message === 'Network Error' ? 'Cannot reach the server. Is the backend running?' : e?.message) || 'Something went wrong';
};

/** Unwraps { success, data } */
export const get = (url, params) => api.get(url, { params }).then((r) => r.data.data);
export const post = (url, body) => api.post(url, body).then((r) => r.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data);
export const del = (url) => api.delete(url).then((r) => r.data);

export default api;
