import { API_URL } from "./constants";

const baseUrl = API_URL;

async function request(method: string, endpoint: string, body?: any): Promise<any> {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const json: { message: string } = await response.json();
    if (!response.ok) throw new Error(json.message || 'An error occurred');
    return json;
}

export function get(endpoint: string): Promise<any> {
    return request('GET', endpoint);
}

export function post(endpoint: string, body: any): Promise<any> {
    return request('POST', endpoint, body);
}

export function put(endpoint: string, body: any): Promise<any> {
    return request('PUT', endpoint, body);
}

export function del(endpoint: string): Promise<any> { // renamed to `del` to avoid conflict with reserved keyword
    return request('DELETE', endpoint);
}
