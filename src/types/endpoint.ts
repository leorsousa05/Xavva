export interface ApiParam {
    name: string;
    type: string;
    source: "PATH" | "QUERY" | "BODY" | "HEADER" | "FORM";
    required: boolean;
}

export interface ApiEndpoint {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "ALL";
    path: string;
    fullPath: string;
    className: string;
    methodName: string;
    parameters: ApiParam[];
}
