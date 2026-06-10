# PowerShell script to revert admin views to their pre-TailAdmin state by extracting them from transcript write_to_file logs.

$logPath = "C:\Users\Asus\.gemini\antigravity-ide\brain\d35717b0-8c57-437e-aca2-731c59ed39ef\.system_generated\logs\transcript.jsonl"
$targetFiles = @(
    "src/layouts/AdminLayout.tsx",
    "src/pages/admin/AdminDashboardPage.tsx",
    "src/pages/admin/AdminProductsPage.tsx",
    "src/pages/admin/AdminProductFormPage.tsx",
    "src/pages/admin/AdminInventoryPage.tsx",
    "src/pages/admin/AdminInventoryTransactionsPage.tsx",
    "src/pages/admin/AdminSuppliersPage.tsx",
    "src/pages/admin/AdminOrdersPage.tsx",
    "src/pages/admin/AdminOrderDetailPage.tsx",
    "src/pages/admin/AdminSimulateSalePage.tsx",
    "src/pages/admin/AdminPurchaseRequestsPage.tsx",
    "src/pages/admin/AdminPurchaseRequestDetailPage.tsx",
    "src/pages/admin/AdminAgentLogsPage.tsx",
    "src/components/common/Button.tsx",
    "src/components/common/Input.tsx",
    "src/components/common/Select.tsx",
    "src/components/common/Badge.tsx"
)

# Read logs line by line
$lines = Get-Content -Path $logPath
Write-Host "Total log lines: $($lines.Count)"

foreach ($file in $targetFiles) {
    # Replace slashes for matching in JSON pathing
    $escapedFile = $file.Replace("/", "\\\\")
    Write-Host "Processing $file (escaped: $escapedFile)..."
    
    $content = $null
    # Iterate in chronological order to find the first creation or edit before Vibe Code Run 2
    foreach ($line in $lines) {
        # Check if line contains write_to_file or code action and the target file path
        if ($line -like "*write_to_file*" -and $line -like "*$escapedFile*") {
            # Parse step index to make sure it is before step index 463
            if ($line -match '"step_index":(\d+)') {
                $stepIdx = [int]$Matches[1]
                if ($stepIdx -ge 463) {
                    continue # Ignore writes from Vibe Code Run 2 onwards
                }
            }
            
            # Use PowerShell JSON parsing
            try {
                $json = ConvertFrom-Json $line
                
                # Check planner response tool calls
                if ($json.tool_calls) {
                    foreach ($call in $json.tool_calls) {
                        if ($call.name -eq "write_to_file" -and $call.args.TargetFile -like "*$file") {
                            $content = $call.args.CodeContent
                        }
                    }
                }
            } catch {
                # JSON parse fail, try regex
                if ($line -match '"CodeContent":"(.*?)"') {
                    $content = [System.Text.RegularExpressions.Regex]::Unescape($Matches[1])
                }
            }
        }
    }
    
    if ($content) {
        $destPath = Join-Path "d:\hoc\TieuLuanChuyenNganh\CAFE\apps\web" $file
        # Ensure directory exists
        $dir = Split-Path $destPath
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        # Write to file
        Set-Content -Path $destPath -Value $content -Encoding utf8
        Write-Host "Successfully restored $file to pre-TailAdmin state!"
    } else {
        Write-Host "WARNING: Could not find pre-TailAdmin content for $file"
    }
}
