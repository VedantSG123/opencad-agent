$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$utf8 = [System.Text.UTF8Encoding]::new($false)
$stdin = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), $utf8, $false)
$stdout = [System.IO.StreamWriter]::new([Console]::OpenStandardOutput(), $utf8)
$stdout.AutoFlush = $true

function Convert-CommandElement {
    param($element)

    if ($element -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
        return @($element.Value)
    }
    if ($element -is [System.Management.Automation.Language.ExpandableStringExpressionAst]) {
        if ($element.NestedExpressions.Count -gt 0) { return $null }
        return @($element.Value)
    }
    if ($element -is [System.Management.Automation.Language.ConstantExpressionAst]) {
        return @($element.Value.ToString())
    }
    if ($element -is [System.Management.Automation.Language.CommandParameterAst]) {
        if ($element.Argument -eq $null) { return @('-' + $element.ParameterName) }
        if ($element.Argument -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
            return @(('-' + $element.ParameterName), $element.Argument.Value)
        }
        if ($element.Argument -is [System.Management.Automation.Language.ConstantExpressionAst]) {
            return @(('-' + $element.ParameterName), $element.Argument.Value.ToString())
        }
        return $null
    }
    return $null
}

function Convert-PipelineElement {
    param($element)

    if ($element -is [System.Management.Automation.Language.CommandAst]) {
        if (
            $element.InvocationOperator -ne $null -and
            $element.InvocationOperator -ne [System.Management.Automation.Language.TokenKind]::Unknown
        ) { return $null }

        $parts = @()
        foreach ($commandElement in $element.CommandElements) {
            $converted = Convert-CommandElement $commandElement
            if ($converted -eq $null) { return $null }
            $parts += $converted
        }
        return $parts
    }
    return $null
}

function Add-CommandsFromPipelineAst {
    param($pipeline, $commands)

    if ($pipeline.PipelineElements.Count -eq 0) { return $false }
    foreach ($element in $pipeline.PipelineElements) {
        $words = Convert-PipelineElement $element
        if ($words -eq $null -or $words.Count -eq 0) { return $false }
        $null = $commands.Add(@($words))
    }
    return $true
}

function Add-CommandsFromPipelineBase {
    param($pipeline, $commands)

    if ($pipeline -is [System.Management.Automation.Language.PipelineAst]) {
        return Add-CommandsFromPipelineAst $pipeline $commands
    }
    # Windows PowerShell 5.1 has no PipelineChainAst type, so a direct type
    # reference here would stop the whole script from parsing there.
    if ($pipeline.GetType().FullName -eq 'System.Management.Automation.Language.PipelineChainAst') {
        if (-not (Add-CommandsFromPipelineBase $pipeline.LhsPipelineChain $commands)) { return $false }
        return Add-CommandsFromPipelineAst $pipeline.RhsPipeline $commands
    }
    return $false
}

function Invoke-ParseRequest {
    param($RequestId, $Source)

    $tokens = $null
    $errors = $null
    $ast = $null
    try {
        $ast = [System.Management.Automation.Language.Parser]::ParseInput($Source, [ref]$tokens, [ref]$errors)
    } catch {
        return @{ id = $RequestId; status = 'parseFailed' }
    }
    if ($errors.Count -gt 0) {
        return @{ id = $RequestId; status = 'parseErrors' }
    }

    $hasSubstitution = $false
    $hasRedirection = $false
    foreach ($token in $tokens) {
        if ($token.Text -eq '--%') {
            return @{ id = $RequestId; status = 'unsupported'; hasSubstitution = $hasSubstitution }
        }
        $kind = $token.Kind.ToString()
        if ($kind -eq 'DollarParen' -or $kind -eq 'AtParen') { $hasSubstitution = $true }
        if ($kind -eq 'Redirection' -or $kind -eq 'RedirectInStd') { $hasRedirection = $true }
    }

    $cleanBlock = $ast.PSObject.Properties['CleanBlock']
    if (
        $ast.ParamBlock -ne $null -or
        $ast.DynamicParamBlock -ne $null -or
        $ast.BeginBlock -ne $null -or
        $ast.ProcessBlock -ne $null -or
        ($cleanBlock -ne $null -and $cleanBlock.Value -ne $null) -or
        $ast.UsingStatements.Count -gt 0 -or
        $ast.EndBlock.Traps.Count -gt 0
    ) {
        return @{ id = $RequestId; status = 'unsupported'; hasSubstitution = $hasSubstitution }
    }

    $commands = [System.Collections.ArrayList]::new()
    foreach ($statement in $ast.EndBlock.Statements) {
        if (-not (Add-CommandsFromPipelineBase $statement $commands)) {
            return @{ id = $RequestId; status = 'unsupported'; hasSubstitution = $hasSubstitution }
        }
    }

    return @{
        id = $RequestId
        status = 'ok'
        commands = $commands
        hasSubstitution = $hasSubstitution
        hasRedirection = $hasRedirection
    }
}

while (($requestLine = $stdin.ReadLine()) -ne $null) {
    $request = $null
    try { $request = $requestLine | ConvertFrom-Json } catch {
        $stdout.WriteLine((@{ id = -1; status = 'parseFailed' } | ConvertTo-Json -Compress -Depth 4))
        continue
    }

    $requestId = $request.id
    $payload = $request.payload
    if ([string]::IsNullOrEmpty($payload)) {
        $stdout.WriteLine((@{ id = $requestId; status = 'parseFailed' } | ConvertTo-Json -Compress -Depth 4))
        continue
    }

    $source = $null
    try {
        $source = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String($payload))
    } catch {
        $stdout.WriteLine((@{ id = $requestId; status = 'parseFailed' } | ConvertTo-Json -Compress -Depth 4))
        continue
    }

    $response = Invoke-ParseRequest -RequestId $requestId -Source $source
    $stdout.WriteLine(($response | ConvertTo-Json -Compress -Depth 4))
}
