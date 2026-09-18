export const codeLanguages = ["cURL", "JavaScript", "Python", "Java", "Go", "Kotlin", "Objective-C", "PHP", "ASP", "Ruby", "Swift"] as const;
export type CodeLanguage = typeof codeLanguages[number];
export type CodeSamples = Partial<Record<CodeLanguage, string>>;

type RequestSampleOptions = {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, string>;
  idempotencyKey?: string;
};

const apiBase = "https://sandbox-api.getprio.online/v1";

export function requestSamples({ method, path, body, idempotencyKey }: RequestSampleOptions): CodeSamples {
  const url = apiBase + path;
  const bodyText = body ? JSON.stringify(body) : "";
  const bodyJson = bodyText ? JSON.stringify(bodyText) : "";
  const bodyObject = body ? JSON.stringify(body, null, 2) : "";
  const csharpBody = body ? "new { " + Object.entries(body).map(([key, value]) => key + " = " + JSON.stringify(value)).join(", ") + " }" : "";
  const idempotencyHeader = idempotencyKey ? "\n  -H 'Idempotency-Key: " + idempotencyKey + "' \\" : "";
  const curlBody = bodyText ? "\n  -H 'Content-Type: application/json' \\\n  -d '" + bodyText + "'" : "";
  const javascriptOptions = [
    "  method: \"" + method + "\",",
    "  headers: {",
    "    \"X-API-Key\": \"gpk_sbx_...\"," ,
    ...(idempotencyKey ? ["    \"Idempotency-Key\": \"" + idempotencyKey + "\","] : []),
    ...(bodyText ? ["    \"Content-Type\": \"application/json\","] : []),
    "  },",
    ...(bodyText ? ["  body: JSON.stringify(" + bodyObject + "),"] : [])
  ].join("\n");
  const pythonHeaders = "headers = {\"X-API-Key\": \"gpk_sbx_...\"" + (idempotencyKey ? ", \"Idempotency-Key\": \"" + idempotencyKey + "\"" : "") + "}";
  const javaHeaders = [
    "requestBuilder.header(\"X-API-Key\", \"gpk_sbx_...\");",
    ...(idempotencyKey ? ["requestBuilder.header(\"Idempotency-Key\", \"" + idempotencyKey + "\");"] : []),
    ...(bodyText ? ["requestBuilder.header(\"Content-Type\", \"application/json\");"] : [])
  ].join("\n");
  const javaMethod = bodyText
    ? ".method(\"" + method + "\", HttpRequest.BodyPublishers.ofString(" + bodyJson + "))"
    : ".GET()";
  const goHeaders = [
    "req.Header.Set(\"X-API-Key\", \"gpk_sbx_...\")",
    ...(idempotencyKey ? ["req.Header.Set(\"Idempotency-Key\", \"" + idempotencyKey + "\")"] : []),
    ...(bodyText ? ["req.Header.Set(\"Content-Type\", \"application/json\")"] : [])
  ].join("\n");
  const kotlinHeaders = [
    "  .addHeader(\"X-API-Key\", \"gpk_sbx_...\")",
    ...(idempotencyKey ? ["  .addHeader(\"Idempotency-Key\", \"" + idempotencyKey + "\")"] : [])
  ].join("\n");
  const escapedObjectiveCBody = bodyText.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const phpHeaders = "curl_setopt($ch, CURLOPT_HTTPHEADER, [\"X-API-Key: gpk_sbx_...\"" +
    (idempotencyKey ? ", \"Idempotency-Key: " + idempotencyKey + "\"" : "") +
    (bodyText ? ", \"Content-Type: application/json\"" : "") + "]);";
  const rubyHeaders = [
    "request[\"X-API-Key\"] = \"gpk_sbx_...\"",
    ...(idempotencyKey ? ["request[\"Idempotency-Key\"] = \"" + idempotencyKey + "\""] : []),
    ...(bodyText ? ["request[\"Content-Type\"] = \"application/json\"", "request.body = " + JSON.stringify(bodyText)] : [])
  ].join("\n");
  const swiftHeaders = [
    "request.setValue(\"gpk_sbx_...\", forHTTPHeaderField: \"X-API-Key\")",
    ...(idempotencyKey ? ["request.setValue(\"" + idempotencyKey + "\", forHTTPHeaderField: \"Idempotency-Key\")"] : []),
    ...(bodyText ? ["request.setValue(\"application/json\", forHTTPHeaderField: \"Content-Type\")", "request.httpBody = Data(" + JSON.stringify(bodyText) + ".utf8)"] : [])
  ].join("\n");

  return {
    cURL: "curl " + url + " -X " + method + " \\\n  -H 'X-API-Key: gpk_sbx_...'" + idempotencyHeader + curlBody,
    JavaScript: "const response = await fetch(" + JSON.stringify(url) + ", {\n" + javascriptOptions + "\n});\nconst result = await response.json();",
    Python: "import requests\n\n" + pythonHeaders + "\nresponse = requests." + method.toLowerCase() + "(" + JSON.stringify(url) + ", headers=headers" + (bodyText ? ", json=" + bodyObject : "") + ")\nresult = response.json()",
    Java: "HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(URI.create(" + JSON.stringify(url) + "));\n" + javaHeaders + "\nHttpRequest request = requestBuilder" + javaMethod + ".build();\nHttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());",
    Go: "import (\"net/http\"\n  \"strings\")\n\nreq, _ := http.NewRequest(\"" + method + "\", \"" + url + "\", " + (bodyText ? "strings.NewReader(" + JSON.stringify(bodyText) + ")" : "nil") + ")\n" + goHeaders + "\nresp, _ := http.DefaultClient.Do(req)",
    Kotlin: "val request = Request.Builder()\n  .url(" + JSON.stringify(url) + ")\n" + kotlinHeaders + (bodyText ? "\n  .method(\"" + method + "\", " + JSON.stringify(bodyText) + ".toRequestBody(\"application/json\".toMediaType()))" : "\n  .method(\"" + method + "\", null)") + "\n  .build()\nval response = OkHttpClient().newCall(request).execute()",
    "Objective-C": "NSURL *url = [NSURL URLWithString:" + JSON.stringify(url) + "];\nNSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];\nrequest.HTTPMethod = @\"" + method + "\";\n[request setValue:@\"gpk_sbx_...\" forHTTPHeaderField:@\"X-API-Key\"];" +
      (idempotencyKey ? "\n[request setValue:@\"" + idempotencyKey + "\" forHTTPHeaderField:@\"Idempotency-Key\"];" : "") +
      (bodyText ? "\n[request setValue:@\"application/json\" forHTTPHeaderField:@\"Content-Type\"];\nrequest.HTTPBody = [@\"" + escapedObjectiveCBody + "\" dataUsingEncoding:NSUTF8StringEncoding];" : "") +
      "\nNSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) { }];\n[task resume];",
    PHP: "<?php\n$ch = curl_init(" + JSON.stringify(url) + ");\ncurl_setopt($ch, CURLOPT_CUSTOMREQUEST, \"" + method + "\");\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n" + phpHeaders + (bodyText ? "\ncurl_setopt($ch, CURLOPT_POSTFIELDS, " + JSON.stringify(bodyText) + ");" : "") + "\n$result = curl_exec($ch);\ncurl_close($ch);",
    ASP: "using System.Net.Http.Json;\n\nusing var client = new HttpClient();\nusing var request = new HttpRequestMessage(HttpMethod." + (method === "GET" ? "Get" : "Post") + ", " + JSON.stringify(url) + ");\nrequest.Headers.Add(\"X-API-Key\", \"gpk_sbx_...\");" +
      (idempotencyKey ? "\nrequest.Headers.Add(\"Idempotency-Key\", \"" + idempotencyKey + "\");" : "") +
      (bodyText ? "\nrequest.Content = JsonContent.Create(" + csharpBody + ");" : "") +
      "\nusing var response = await client.SendAsync(request);",
    Ruby: "require \"net/http\"\nrequire \"json\"\n\nuri = URI(" + JSON.stringify(url) + ")\nrequest = Net::HTTP::" + (method === "GET" ? "Get" : "Post") + ".new(uri)\n" + rubyHeaders + "\nresponse = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(request) }",
    Swift: "var request = URLRequest(url: URL(string: " + JSON.stringify(url) + ")!)\nrequest.httpMethod = \"" + method + "\"\n" + swiftHeaders + "\nlet (data, _) = try await URLSession.shared.data(for: request)"
  };
}

export const ticketIssueSamples = requestSamples({
  method: "POST",
  path: "/queues/example-profile/tickets",
  body: { display_label: "Walk-in", external_reference: "order-123" },
  idempotencyKey: "ticket-issue-001"
});

export const createProfileSamples = requestSamples({
  method: "POST",
  path: "/profiles",
  body: { slug: "example-profile", display_name: "Example Service Desk" },
  idempotencyKey: "profile-create-001"
});

export const readTicketSamples = requestSamples({
  method: "GET",
  path: "/queues/example-profile/tickets/ticket_123"
});
