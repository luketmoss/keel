package com.luketmoss.thrivespin.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.luketmoss.thrivespin.R
import com.luketmoss.thrivespin.core.SpinSizes
import com.luketmoss.thrivespin.core.TestResult
import kotlinx.coroutines.launch

/**
 * Settings: "API URL", "Key" (masked, with a show toggle), "Test connection", "Save", and one line
 * of result text. State is hoisted to what the activity passes in; the key is held in a field and
 * nowhere else, and is never written to a log.
 *
 * [onSave] returns a result to show when it refused, or null when it saved.
 */
@Composable
fun SettingsScreen(
    initialUrl: String,
    initialKey: String,
    onBack: () -> Unit,
    onTest: suspend (url: String, key: String) -> TestResult,
    onSave: suspend (url: String, key: String) -> TestResult?,
) {
    var url by remember { mutableStateOf(initialUrl) }
    var key by remember { mutableStateOf(initialKey) }
    var showKey by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(spin.bg)
            .safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack, modifier = Modifier.size(SpinSizes.TAP_TARGET.dp)) {
                Icon(painterResource(R.drawable.ic_back), contentDescription = "Back", tint = spin.text)
            }
            SpinText("Settings", Tokens.TEXT_2XL, color = spin.text, weight = FontWeight.Bold)
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceMd),
            verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd),
        ) {
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
                    TextButton(onClick = { showKey = !showKey }) {
                        Text(if (showKey) "Hide" else "Show", color = spin.primaryText)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
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
                    modifier = Modifier.heightIn(min = SpinSizes.TAP_TARGET.dp),
                    shape = Tokens.radiusMd,
                    border = BorderStroke(1.dp, spin.border),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = spin.primaryText),
                ) { Text("Test connection") }

                Button(
                    enabled = !busy,
                    onClick = {
                        scope.launch {
                            val refusal = onSave(url, key)
                            status = refusal?.message ?: "Saved"
                        }
                    },
                    modifier = Modifier.heightIn(min = SpinSizes.TAP_TARGET.dp),
                    shape = Tokens.radiusMd,
                    colors = ButtonDefaults.buttonColors(containerColor = spin.primaryFill, contentColor = spin.onFill),
                ) { Text("Save") }
            }

            if (status.isNotEmpty()) {
                SpinText(status, Tokens.TEXT_BASE, color = spin.text)
            }
        }
    }
}
