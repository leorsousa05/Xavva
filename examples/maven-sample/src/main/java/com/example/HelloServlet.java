package com.example;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Sample Servlet demonstrating Xavva hot-reload capabilities.
 * 
 * Try modifying the message and see the changes instantly with:
 *   xavva dev --watch
 */
@WebServlet(name = "HelloServlet", urlPatterns = {"/hello"})
public class HelloServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) 
            throws ServletException, IOException {
        
        response.setContentType("text/html;charset=UTF-8");
        
        try (PrintWriter out = response.getWriter()) {
            out.println("<!DOCTYPE html>");
            out.println("<html>");
            out.println("<head>");
            out.println("    <title>Xavva Sample</title>");
            out.println("    <style>");
            out.println("        body { font-family: Arial, sans-serif; margin: 40px; }");
            out.println("        .container { max-width: 800px; margin: 0 auto; }");
            out.println("        .success { color: #28a745; }");
            out.println("        .info { background: #f8f9fa; padding: 20px; border-radius: 5px; }");
            out.println("    </style>");
            out.println("</head>");
            out.println("<body>");
            out.println("    <div class='container'>");
            out.println("        <h1 class='success'>✓ Xavva is working!</h1>");
            out.println("        <div class='info'>");
            out.println("            <h2>HelloServlet</h2>");
            out.println("            <p><strong>Current time:</strong> " + getCurrentTime() + "</p>");
            out.println("            <p><strong>Server:</strong> " + getServletContext().getServerInfo() + "</p>");
            out.println("            <p><strong>Servlet Version:</strong> " + getServletContext().getMajorVersion() + "." + getServletContext().getMinorVersion() + "</p>");
            out.println("            <br>");
            out.println("            <p>Edit <code>HelloServlet.java</code> and save to see hot-reload in action!</p>");
            out.println("        </div>");
            out.println("    </div>");
            out.println("</body>");
            out.println("</html>");
        }
    }

    private String getCurrentTime() {
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }
}
