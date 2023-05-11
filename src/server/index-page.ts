export const indexPage = `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Skyscanner app</title>
        <link
            href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css"
            rel="stylesheet"
            integrity="sha384-KK94CHFLLe+nY2dmCWGMq91rCGa5gtU4mk92HdvYe+M/SXH301p5ILy+dN9+nJOZ"
            crossorigin="anonymous"
        />
    </head>
    <body>
        <div class="container text-center">
            <div class="row">
                <div class="col">
                    <h1>Skyscanner app</h1>
                </div>
            </div>
            <div class="row">
                <div class="col">
                    <form id="request-form">
                        <div class="mb-3">
                            <label for="request" class="form-label">Request</label>
                            <textarea class="form-control" name="request" id="request" rows="15"></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary">Submit</button>
                    </form>
                </div>
            </div>
            <div class="row">
                <div class="col">&nbsp;</div>
            </div>
            <div class="row">
                <div class="col">
                    <form>
                        <div class="mb-3">
                            <label for="log" class="form-label">Request log</label>
                            <textarea class="form-control" id="log" rows="5" readonly></textarea>
                        </div>
                    </form>
                </div>
            </div>
            <div class="row">
                <div class="col">
                    <a id="download" class="d-none"></a>
                </div>
            </div>
        </div>
        <script>
            document.addEventListener('DOMContentLoaded', function () {
                const form = document.getElementById('request-form')

                form.addEventListener('submit', function (event) {
                    try {
                        event.preventDefault()

                        const data = new FormData(event.target)
                        const dataObject = Object.fromEntries(data.entries())
                        const rq = JSON.stringify({ action: 'run', journeys: JSON.parse(dataObject.request) })

                        const log = document.getElementById('log')
                        log.value = ''

                        const loc = window.location
                        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'

                        const webSocket = new WebSocket(proto + '//' + loc.host  + '/ws')

                        webSocket.onmessage = (event) => {
                            const resp = JSON.parse(event.data)

                            log.value += resp.message + "\\n"
                            log.scrollTop = log.scrollHeight

                            if (resp.status === 'failed') {
                                webSocket.close()
                                return
                            }

                            if (resp.status === 'success') {
                                webSocket.close()
                                const split = resp.data.split(',')
                                const b64data = split[1] || split[0]
                                const blob = new Blob([atob(b64data)], { type: 'application/vnd.ms-excel' })
                                const href = window.URL.createObjectURL(blob)
                                const download = document.getElementById('download')
                                download.setAttribute('href', href)
                                download.setAttribute('download', resp.filename)
                                download.click()
                                window.URL.revokeObjectURL(href)
                            }
                        }

                        webSocket.onopen = () => {
                            webSocket.send(rq)
                        }
                    } catch (err) {
                        console.log(err)
                        return alert('invalid request')
                    }
                })
            })
        </script>
    </body>
</html>
`
