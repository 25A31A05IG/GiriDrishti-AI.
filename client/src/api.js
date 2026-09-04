const API_BASE = "http://localhost:5000/api";

export async function apiGet(
  endpoint
) {

  const response =
    await fetch(
      `${API_BASE}${endpoint}`
    );


  if (!response.ok) {

    throw new Error(
      `API error: ${response.status}`
    );

  }


  return response.json();

}


export async function apiPost(
  endpoint,
  body
) {

  const response =
    await fetch(
      `${API_BASE}${endpoint}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );


  if (!response.ok) {

    throw new Error(
      `API error: ${response.status}`
    );

  }


  return response.json();

}


export async function apiUpload(
  endpoint,
  formData
) {

  const response =
    await fetch(
      `${API_BASE}${endpoint}`,
      {
        method: "POST",

        body: formData
      }
    );


  if (!response.ok) {

    throw new Error(
      `API error: ${response.status}`
    );

  }


  return response.json();

}


export {
  API_BASE
};