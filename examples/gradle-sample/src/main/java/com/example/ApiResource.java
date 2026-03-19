package com.example;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * Sample JAX-RS REST API demonstrating Xavva hot-reload.
 * 
 * Try modifying the endpoints and see changes instantly with:
 *   xavva dev --watch
 * 
 * Available endpoints:
 *   GET  /api/hello        - Simple greeting
 *   GET  /api/time         - Current server time
 *   GET  /api/info         - Server information
 *   POST /api/echo         - Echo request body
 */
@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ApiResource {

    @GET
    @Path("/hello")
    public Response sayHello() {
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Hello from Xavva + Gradle! 🚀");
        response.put("timestamp", getCurrentTime());
        response.put("status", "success");
        
        return Response.ok(response).build();
    }

    @GET
    @Path("/time")
    public Response getTime() {
        Map<String, Object> response = new HashMap<>();
        response.put("serverTime", getCurrentTime());
        response.put("epochMillis", System.currentTimeMillis());
        
        return Response.ok(response).build();
    }

    @GET
    @Path("/info")
    public Response getInfo() {
        Map<String, Object> response = new HashMap<>();
        response.put("application", "gradle-xavva-sample");
        response.put("version", "1.0.0-SNAPSHOT");
        response.put("javaVersion", System.getProperty("java.version"));
        response.put("javaVendor", System.getProperty("java.vendor"));
        response.put("osName", System.getProperty("os.name"));
        response.put("osVersion", System.getProperty("os.version"));
        
        return Response.ok(response).build();
    }

    @POST
    @Path("/echo")
    public Response echo(Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        response.put("echo", body);
        response.put("receivedAt", getCurrentTime());
        
        return Response.ok(response).build();
    }

    private String getCurrentTime() {
        return LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }
}
