package com.ccfox12.kentucky;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.activity.result.ActivityResult;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

@CapacitorPlugin(name = "KentuckySaf")
@SuppressWarnings("unused")
public class KentuckySafPlugin extends Plugin {
    private static final String PREFS_NAME = "kentucky_saf";
    private static final String TREE_URI_KEY = "kentucky_saf_tree_uri";
    private static final String TREE_NAME_KEY = "kentucky_saf_tree_name";
    private static final int BUFFER_SIZE = 8192;

    @PluginMethod
    public void openTree(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, intent, "handleOpenTreeResult");
    }

    @ActivityCallback
    public void handleOpenTreeResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Folder selection was cancelled");
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("Folder selection did not return a URI");
            return;
        }

        try {
            final int takeFlags =
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
            DocumentFile tree = DocumentFile.fromTreeUri(getContext(), uri);
            if (tree == null || !tree.canRead()) {
                call.reject("The selected folder is not readable");
                return;
            }

            String name = tree.getName();
            if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
            prefs().edit().putString(TREE_URI_KEY, uri.toString()).putString(TREE_NAME_KEY, name).apply();

            JSObject output = new JSObject();
            output.put("treeUri", uri.toString());
            output.put("name", name);
            call.resolve(output);
        } catch (SecurityException error) {
            call.reject("Could not persist permission for the selected folder", error);
        }
    }

    @PluginMethod
    public void restoreTree(PluginCall call) {
        String treeUri = prefs().getString(TREE_URI_KEY, null);
        String name = prefs().getString(TREE_NAME_KEY, null);
        if (treeUri == null || !hasTreeAccess(treeUri)) {
            clearSavedTree();
            call.resolve();
            return;
        }

        DocumentFile tree = tree(treeUri);
        if (tree == null || !tree.canRead()) {
            clearSavedTree();
            call.resolve();
            return;
        }

        JSObject output = new JSObject();
        output.put("treeUri", treeUri);
        output.put("name", name != null ? name : tree.getName());
        call.resolve(output);
    }

    @PluginMethod
    public void listDir(PluginCall call) {
        try {
            DocumentFile directory = resolvePath(requireTree(call), call.getString("path", ""), false);
            if (directory == null || !directory.isDirectory()) throw new IOException("Directory does not exist");

            List<DocumentFile> files = new ArrayList<>();
            Collections.addAll(files, directory.listFiles());
            Collections.sort(files, new Comparator<DocumentFile>() {
                @Override
                public int compare(DocumentFile left, DocumentFile right) {
                    if (left.isDirectory() != right.isDirectory()) return left.isDirectory() ? -1 : 1;
                    String leftName = left.getName() == null ? "" : left.getName();
                    String rightName = right.getName() == null ? "" : right.getName();
                    return leftName.compareToIgnoreCase(rightName);
                }
            });

            JSArray entries = new JSArray();
            for (DocumentFile child : files) {
                JSObject entry = new JSObject();
                entry.put("name", child.getName());
                entry.put("isDirectory", child.isDirectory());
                if (!child.isDirectory() && child.getType() != null) entry.put("mimeType", child.getType());
                entries.put(entry);
            }
            JSObject output = new JSObject();
            output.put("entries", entries);
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not list directory", error);
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        try {
            DocumentFile file = requireFile(requireTree(call), call.getString("path"));
            JSObject output = new JSObject();
            output.put("content", new String(readBytes(file), StandardCharsets.UTF_8));
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not read file", error);
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        try {
            String content = call.getString("content");
            if (content == null) throw new IOException("content is required");
            String path = call.getString("path");
            // application/octet-stream keeps the exact display name (avoids foo.csv.txt / foo.md.txt).
            writeBytes(requireTree(call), path, content.getBytes(StandardCharsets.UTF_8), mimeForPath(path));
            call.resolve();
        } catch (Exception error) {
            reject(call, "Could not write file", error);
        }
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        try {
            DocumentFile directory = ensureDirectory(requireTree(call), call.getString("path"));
            JSObject output = new JSObject();
            output.put("path", cleanPath(call.getString("path")));
            output.put("name", directory.getName());
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not create directory", error);
        }
    }

    @PluginMethod
    public void delete(PluginCall call) {
        try {
            String path = cleanPath(call.getString("path"));
            if (path.isEmpty()) throw new IOException("Deleting the workspace root is not allowed");
            DocumentFile target = resolvePath(requireTree(call), path, false);
            if (target != null && !deleteRecursive(target)) throw new IOException("Provider refused to delete " + path);
            call.resolve();
        } catch (Exception error) {
            reject(call, "Could not delete path", error);
        }
    }

    @PluginMethod
    public void exists(PluginCall call) {
        try {
            DocumentFile file = resolvePath(requireTree(call), call.getString("path", ""), false);
            JSObject output = new JSObject();
            output.put("exists", file != null && file.exists());
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not check path", error);
        }
    }

    @PluginMethod
    public void copyFile(PluginCall call) {
        try {
            DocumentFile tree = requireTree(call);
            String sourcePath = cleanPath(call.getString("from"));
            String destinationPath = cleanPath(call.getString("to"));
            if (destinationPath.isEmpty()) throw new IOException("Destination file path is required");
            if (sourcePath.equals(destinationPath)) {
                requireFile(tree, sourcePath);
                call.resolve();
                return;
            }
            DocumentFile source = requireFile(tree, sourcePath);
            DocumentFile existing = resolvePath(tree, destinationPath, false);
            try (InputStream input = getContext().getContentResolver().openInputStream(source.getUri())) {
                if (input == null) throw new IOException("Provider could not open source file");
                if (existing != null && !deleteRecursive(existing)) throw new IOException("Could not replace destination");
                writeStream(tree, destinationPath, input, source.getType() == null ? "application/octet-stream" : source.getType());
            }
            call.resolve();
        } catch (Exception error) {
            reject(call, "Could not copy file", error);
        }
    }

    @PluginMethod
    public void readFileBase64(PluginCall call) {
        try {
            DocumentFile file = requireFile(requireTree(call), call.getString("path"));
            JSObject output = new JSObject();
            output.put("data", Base64.encodeToString(readBytes(file), Base64.NO_WRAP));
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not read binary file", error);
        }
    }

    @PluginMethod
    public void writeFileBase64(PluginCall call) {
        try {
            String data = call.getString("data");
            if (data == null) throw new IOException("data is required");
            int comma = data.indexOf(',');
            if (data.startsWith("data:") && comma >= 0) data = data.substring(comma + 1);
            writeBytes(requireTree(call), call.getString("path"), Base64.decode(data, Base64.DEFAULT), "application/octet-stream");
            call.resolve();
        } catch (Exception error) {
            reject(call, "Could not write binary file", error);
        }
    }

    @PluginMethod
    public void pickImages(PluginCall call) {
        try {
            requireTree(call);
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.setType("image/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, intent, "handlePickImagesResult");
        } catch (Exception error) {
            reject(call, "A valid workspace treeUri is required", error);
        }
    }

    @ActivityCallback
    public void handlePickImagesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Image selection was cancelled");
            return;
        }

        try {
            DocumentFile tree = requireTree(call);
            Intent data = result.getData();
            List<Uri> selected = new ArrayList<>();
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) selected.add(data.getClipData().getItemAt(i).getUri());
            } else if (data.getData() != null) {
                selected.add(data.getData());
            }

            JSArray paths = new JSArray();
            for (Uri uri : selected) {
                String displayName = getDisplayName(uri);
                String relativePath = uniqueImportPath(tree, displayName);
                String mimeType = getContext().getContentResolver().getType(uri);
                try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IOException("Cannot open selected image");
                    writeStream(tree, relativePath, input, mimeType == null ? "image/*" : mimeType);
                }
                paths.put(relativePath);
            }
            JSObject output = new JSObject();
            output.put("paths", paths);
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not import selected images", error);
        }
    }

    @PluginMethod
    public void pickFiles(PluginCall call) {
        try {
            requireTree(call);
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.setType("*/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, intent, "handlePickFilesResult");
        } catch (Exception error) {
            reject(call, "A valid workspace treeUri is required", error);
        }
    }

    @ActivityCallback
    public void handlePickFilesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("File selection was cancelled");
            return;
        }

        try {
            DocumentFile tree = requireTree(call);
            Intent data = result.getData();
            List<Uri> selected = new ArrayList<>();
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) selected.add(data.getClipData().getItemAt(i).getUri());
            } else if (data.getData() != null) {
                selected.add(data.getData());
            }

            JSArray paths = new JSArray();
            for (Uri uri : selected) {
                String displayName = getDisplayName(uri);
                String relativePath = uniqueContextPath(tree, displayName);
                String mimeType = getContext().getContentResolver().getType(uri);
                try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IOException("Cannot open selected file");
                    writeStream(tree, relativePath, input, mimeType == null ? "application/octet-stream" : mimeType);
                }
                paths.put(relativePath);
            }
            JSObject output = new JSObject();
            output.put("paths", paths);
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not import selected files", error);
        }
    }

    @PluginMethod
    public void getDisplayPath(PluginCall call) {
        try {
            DocumentFile tree = requireTree(call);
            JSObject output = new JSObject();
            output.put("name", tree.getName());
            call.resolve(output);
        } catch (Exception error) {
            reject(call, "Could not get folder name", error);
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private void clearSavedTree() {
        prefs().edit().remove(TREE_URI_KEY).remove(TREE_NAME_KEY).apply();
    }

    private boolean hasTreeAccess(String uriString) {
        for (android.content.UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (uriString.equals(permission.getUri().toString()) && (permission.isReadPermission() || permission.isWritePermission())) return true;
        }
        return false;
    }

    private DocumentFile requireTree(PluginCall call) throws IOException {
        String uri = call.getString("treeUri");
        if (uri == null || uri.isEmpty()) throw new IOException("treeUri is required");
        DocumentFile tree = tree(uri);
        if (tree == null || !tree.exists() || !tree.canRead()) throw new IOException("Workspace folder is unavailable");
        return tree;
    }

    private DocumentFile tree(String uri) {
        try {
            return DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
        } catch (Exception ignored) {
            return null;
        }
    }

    private DocumentFile resolvePath(DocumentFile tree, String path, boolean createDirectories) throws IOException {
        DocumentFile current = tree;
        String[] segments = pathSegments(path);
        for (int i = 0; i < segments.length; i++) {
            String segment = segments[i];
            boolean last = i == segments.length - 1;
            DocumentFile next = current.findFile(segment);
            // Legacy: text/plain creates often appended ".txt" (foo.md.txt / foo.dialogue.csv.txt).
            if (next == null && last && !createDirectories) {
                next = current.findFile(segment + ".txt");
            }
            if (next == null && createDirectories) next = current.createDirectory(segment);
            if (next == null) return null;
            if (!next.isDirectory() && !last) throw new IOException(segment + " is not a directory");
            current = next;
        }
        return current;
    }

    private DocumentFile ensureDirectory(DocumentFile tree, String path) throws IOException {
        DocumentFile directory = resolvePath(tree, path, true);
        if (directory == null || !directory.isDirectory()) throw new IOException("Could not create directory");
        return directory;
    }

    private DocumentFile requireFile(DocumentFile tree, String path) throws IOException {
        String clean = cleanPath(path);
        if (clean.isEmpty()) throw new IOException("File path is required");
        DocumentFile file = resolvePath(tree, clean, false);
        if (file == null || !file.isFile()) throw new IOException("File does not exist: " + clean);
        return file;
    }

    private void writeBytes(DocumentFile tree, String path, byte[] data, String mimeType) throws IOException {
        try (InputStream input = new java.io.ByteArrayInputStream(data)) {
            writeStream(tree, path, input, mimeType);
        }
    }

    private void writeStream(DocumentFile tree, String path, InputStream input, String mimeType) throws IOException {
        String clean = cleanPath(path);
        if (clean.isEmpty()) throw new IOException("File path is required");
        int slash = clean.lastIndexOf('/');
        DocumentFile parent = slash < 0 ? tree : ensureDirectory(tree, clean.substring(0, slash));
        String name = slash < 0 ? clean : clean.substring(slash + 1);
        DocumentFile file = parent.findFile(name);
        if (file != null && file.isDirectory()) throw new IOException("A directory already exists at " + clean);

        // Reclaim legacy SAF mangled names: foo.dialogue.csv.txt / "foo.dialogue.csv (1).txt"
        if (file == null) {
            DocumentFile reclaim = findMangledSibling(parent, name);
            if (reclaim != null) {
                if (reclaim.renameTo(name)) {
                    file = parent.findFile(name);
                    if (file == null) file = reclaim;
                } else {
                    // Provider refused rename — write into mangled node then keep trying.
                    file = reclaim;
                }
            }
        }

        if (file == null) {
            // Always prefer octet-stream so providers keep the exact display name.
            file = parent.createFile("application/octet-stream", name);
            if (file == null && mimeType != null && !mimeType.isEmpty()) {
                file = parent.createFile(mimeType, name);
            }
            if (file == null) throw new IOException("Provider could not create " + clean);
            String createdName = file.getName();
            if (createdName != null && !createdName.equals(name)) {
                if (!file.renameTo(name)) {
                    file.delete();
                    throw new IOException(
                        "SAF provider mangled file name to \"" + createdName +
                        "\" (wanted \"" + name + "\"). Refuse write to avoid .csv.txt / numbered copies."
                    );
                }
                DocumentFile renamed = parent.findFile(name);
                if (renamed != null) file = renamed;
            }
        }

        try (OutputStream output = getContext().getContentResolver().openOutputStream(file.getUri(), "wt")) {
            if (output == null) throw new IOException("Provider could not write " + clean);
            copy(input, output);
        }

        // After a successful canonical write, drop leftover mangled siblings.
        deleteMangledSiblings(parent, name, file);
    }

    /** foo.csv.txt or "foo.csv (1).txt" style collisions from text/plain creates. */
    private DocumentFile findMangledSibling(DocumentFile parent, String name) {
        DocumentFile exactTxt = parent.findFile(name + ".txt");
        if (exactTxt != null && exactTxt.isFile()) return exactTxt;
        String lowerName = name.toLowerCase(java.util.Locale.ROOT);
        DocumentFile best = null;
        for (DocumentFile child : parent.listFiles()) {
            if (child == null || !child.isFile()) continue;
            String n = child.getName();
            if (n == null) continue;
            String lower = n.toLowerCase(java.util.Locale.ROOT);
            if (lower.equals(lowerName + ".txt")) return child;
            // "night_cafe.dialogue.csv (1).txt"
            if (lower.startsWith(lowerName + " (") && lower.endsWith(").txt")) {
                best = child;
            }
        }
        return best;
    }

    private void deleteMangledSiblings(DocumentFile parent, String name, DocumentFile keep) {
        String lowerName = name.toLowerCase(java.util.Locale.ROOT);
        for (DocumentFile child : parent.listFiles()) {
            if (child == null || !child.isFile()) continue;
            if (keep != null && child.getUri().equals(keep.getUri())) continue;
            String n = child.getName();
            if (n == null) continue;
            String lower = n.toLowerCase(java.util.Locale.ROOT);
            boolean mangled =
                lower.equals(lowerName + ".txt") ||
                (lower.startsWith(lowerName + " (") && lower.endsWith(").txt"));
            if (mangled) child.delete();
        }
    }

    /** Prefer octet-stream for text-like files so SAF keeps the exact file name. */
    private String mimeForPath(String path) {
        if (path == null) return "application/octet-stream";
        String lower = path.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private byte[] readBytes(DocumentFile file) throws IOException {
        try (InputStream input = getContext().getContentResolver().openInputStream(file.getUri())) {
            if (input == null) throw new IOException("Provider could not open " + file.getName());
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            copy(input, output);
            return output.toByteArray();
        }
    }

    private boolean deleteRecursive(DocumentFile file) {
        if (file.isDirectory()) {
            for (DocumentFile child : file.listFiles()) {
                if (!deleteRecursive(child)) return false;
            }
        }
        return file.delete();
    }

    private void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[BUFFER_SIZE];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
    }

    private String uniqueImportPath(DocumentFile tree, String displayName) throws IOException {
        return uniquePath(tree, "_imports", displayName, "image");
    }

    private String uniqueContextPath(DocumentFile tree, String displayName) throws IOException {
        return uniquePath(tree, "_context", displayName, "file");
    }

    private String uniquePath(DocumentFile tree, String folder, String displayName, String fallbackName) throws IOException {
        String safeName = displayName.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (safeName.isEmpty()) safeName = fallbackName;
        String base = folder + "/" + safeName;
        if (resolvePath(tree, base, false) == null) return base;
        int dot = safeName.lastIndexOf('.');
        String stem = dot > 0 ? safeName.substring(0, dot) : safeName;
        String extension = dot > 0 ? safeName.substring(dot) : "";
        for (int index = 2; ; index++) {
            String candidate = folder + "/" + stem + "-" + index + extension;
            if (resolvePath(tree, candidate, false) == null) return candidate;
        }
    }

    private String getDisplayName(Uri uri) {
        String name = null;
        try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (column >= 0) name = cursor.getString(column);
            }
        }
        if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
        return name == null || name.isEmpty() ? "image" : name;
    }

    private String cleanPath(String path) throws IOException {
        if (path == null) throw new IOException("path is required");
        String normalized = path.replace('\\', '/').replaceAll("^/+", "").replaceAll("/+$", "");
        if (normalized.isEmpty()) return "";
        for (String segment : normalized.split("/")) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) throw new IOException("Invalid workspace-relative path");
        }
        return normalized;
    }

    private String[] pathSegments(String path) throws IOException {
        String clean = cleanPath(path);
        return clean.isEmpty() ? new String[0] : clean.split("/");
    }

    private String lastSegment(String path) throws IOException {
        String clean = cleanPath(path);
        int slash = clean.lastIndexOf('/');
        return slash < 0 ? clean : clean.substring(slash + 1);
    }

    private void reject(PluginCall call, String message, Exception error) {
        call.reject(message + ": " + error.getMessage(), error);
    }
}
