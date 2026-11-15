$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.DataWriter,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Await-Result($operation,$resultType){
  $task=$asTask.MakeGenericMethod($resultType).Invoke($null,@($operation))
  $task.GetAwaiter().GetResult()
}
$engines=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Where-Object {$_.LanguageTag -match '^(pl|en)(-|$)'} | ForEach-Object {[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($_)})
while($null -ne ($line=[Console]::In.ReadLine())){
  $stream=$null;$writer=$null;$bitmap=$null
  try{
    if(!$engines.Count){[Console]::Out.WriteLine('{"error":"language"}');continue}
    if($line.Length -gt 7000000){throw 'size'}
    $bytes=[Convert]::FromBase64String($line)
    $stream=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $writer=New-Object Windows.Storage.Streams.DataWriter($stream)
    $writer.WriteBytes($bytes)
    $null=Await-Result ($writer.StoreAsync()) ([uint32])
    $null=$writer.DetachStream();$writer.Dispose();$writer=$null
    $stream.Seek(0)
    $decoder=Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    if($decoder.PixelWidth -gt 2000 -or $decoder.PixelHeight -gt 1500){throw 'size'}
    $bitmap=Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $readings=@();$layouts=@()
    foreach($engine in $engines){
      $result=Await-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      $readings+=,@($result.Lines | ForEach-Object {$_.Text})
      $layouts+=,@($result.Lines | ForEach-Object {
        @{words=@($_.Words | ForEach-Object {$r=$_.BoundingRect;@{text=$_.Text;x=$r.X;y=$r.Y;w=$r.Width;h=$r.Height}})}
      })
    }
    [Console]::Out.WriteLine((@{readings=$readings;layouts=$layouts;width=$decoder.PixelWidth;height=$decoder.PixelHeight} | ConvertTo-Json -Depth 8 -Compress))
  }catch{[Console]::Out.WriteLine('{"error":"ocr"}')}
  finally{if($bitmap){$bitmap.Dispose()};if($writer){$writer.Dispose()};if($stream){$stream.Dispose()}}
}
