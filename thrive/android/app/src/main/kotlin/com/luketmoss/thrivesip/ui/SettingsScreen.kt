package com.luketmoss.thrivesip.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivesip.core.TestResult
import kotlinx.coroutines.launch

@Composable
fun SipTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme()) {
        darkColorScheme(primary = Color(SipColors.WATER_DARK), onPrimary = Color(SipColors.ON_ACCENT_DARK))
    } else {
        lightColorScheme(primary = Color(SipColors.WATER_LIGHT), onPrimary = Color(SipColors.ON_ACCENT_LIGHT))
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

/**
 * Title, "API URL", "Key" (masked, with a show toggle), "Test connection" and
 * "Save". State is hoisted to what the activity passes in; the key is held in
 * a field and nowhere else, and is never written to a log.
 *
 * [onSave] returns a message to show when it refused, or null when it saved.
 */
@Composable
fun SettingsScreen(
    initialUrl: String,
    initialKey: String,
    onTest: suspend (url: String, key: String) -> TestResult,
    onSave: suspend (url: String, key: String) -> TestResult?,
) {
    var url by remember { mutableStateOf(initialUrl) }
    var key by remember { mutableStateOf(initialKey) }
    var showKey by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.safeDrawingPadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Thrive Sip", style = MaterialTheme.typography.headlineMedium)

            OutlinedTextField(
                value = url,
                onValueChange = { url = it; status = "" },
                label = { Text("API URL") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = key,
                onValueChange = { key = it; status = "" },
                label = { Text("Key") },
                singleLine = true,
                visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                trailingIcon = {
                    TextButton(onClick = { showKey = !showKey }) { Text(if (showKey) "Hide" else "Show") }
                },
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        status = ""
                        scope.launch {
                            status = onTest(url, key).message
                            busy = false
                        }
                    },
                ) { Text("Test connection") }

                Button(
                    enabled = !busy,
                    onClick = {
                        scope.launch {
                            val refusal = onSave(url, key)
                            status = refusal?.message ?: "Saved"
                        }
                    },
                ) { Text("Save") }
            }

            if (status.isNotEmpty()) {
                Text(status, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}
