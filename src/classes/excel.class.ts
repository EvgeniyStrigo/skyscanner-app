import moment from 'moment'
import { GroupedResult } from '../types/types'

export class ExcelXml {
    generateSimplyReport(groupsOfItems: GroupedResult): string {
        const rows = Object.values(groupsOfItems)
        const rowsCount = rows.length - 1

        if (rowsCount < 0) {
            console.log('No data to save')
            return ''
        }

        const directions = [...new Set(rows.map((items) => items.map((i) => Object.keys(i.flights))).flat(2))]
        const hasBackBlock = directions.length > 1

        const data = rows.map((row, rowIndex) => {
            return (
                row.reduce((acc, item) => {
                    const flightsDuration = moment.duration(item.totalFlightsDuration, 'minutes')
                    return (
                        acc +
                        `
          <Row>
            <Cell><Data ss:Type="String">${item.group}</Data></Cell>
            ${directions
                .map((dir) =>
                    !item.flights[dir]
                        ? '<Cell />'.repeat(6)
                        : `
              <Cell ss:StyleID="s71"><Data ss:Type="DateTime">${item.flights[
                  dir
              ].departureDateTime.toISOString()}</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
              <Cell ss:StyleID="s79"><Data ss:Type="String">${
                  item.flights[dir].departure
              }</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
              <Cell ss:StyleID="s79"><Data ss:Type="String">${
                  item.flights[dir].change
              }</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
              <Cell ss:StyleID="s79"><Data ss:Type="String">${
                  item.flights[dir].arrival
              }</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
              <Cell ss:StyleID="s73"><Data ss:Type="DateTime">${item.flights[
                  dir
              ].arrivalDateTime.toISOString()}</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
              <Cell ss:StyleID="s75"><Data ss:Type="DateTime">1899-12-31T${moment
                  .utc(moment.duration(item.flights[dir].duration, 'minutes').as('milliseconds'))
                  .format('HH:mm:ss')}.000</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
            `
                )
                .join('')}
            
            <Cell ss:StyleID="s75"><Data ss:Type="DateTime">1899-12-31T${moment
                .utc(flightsDuration.as('milliseconds'))
                .format('HH:mm:ss')}.000</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
            <Cell ss:StyleID="s76"><Data ss:Type="Number">${item.price.toFixed(
                2
            )}</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
            
            ${
                hasBackBlock
                    ? `
              <Cell ss:StyleID="s76"><Data ss:Type="Number">${item.rate.toFixed(
                  2
              )}</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
              <Cell ss:StyleID="s76"><Data ss:Type="Number">${item.travelDays.toFixed(
                  2
              )}</Data><NamedCell ss:Name="_FilterDatabase"/></Cell>
              <Cell ss:StyleID="s78" ss:Formula="=CONCATENATE(TRUNC(RC[-1]),&quot; d &quot;, ROUND((RC[-1]-TRUNC(RC[-1]))*24,0),&quot; h&quot;)"/>
            `
                    : ''
            }

            ${item.links
                .map(
                    (link) => `
                <Cell ss:StyleID="s63"><Data ss:Type="String">${link}</Data></Cell>
            `
                )
                .join('')}
            <Cell><Data ss:Type="String"> </Data></Cell>
          </Row>
        `
                    )
                }, '') +
                (rowIndex < rowsCount
                    ? `<Row>${'<Cell ss:StyleID="s81"/>'.repeat(this.getColumnsCount(true, hasBackBlock))}</Row>`
                    : '')
            )
        })

        return this.getUrlData(this.template(true, hasBackBlock).replace(this.replaceMark, data.join('')))
    }

    getColumnsCount(isSimple = false, hasBackBlock = true) {
        return isSimple ? (hasBackBlock ? 19 : 10) : 20
    }

    getUrlData(data: string): string {
        const mime_type = 'application/vnd.ms-excel'
        const buffer = Buffer.from(data)
        return `data:${mime_type};base64,` + buffer.toString('base64')
    }

    replaceMark = '<!-- content here -->'

    template(isSimple = false, hasBackBlock = true) {
        const filterColumns = this.getColumnsCount(isSimple, hasBackBlock) - 2

        return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Version>12.00</Version></DocumentProperties>
        <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel"/>
        <Styles>
            <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" x:CharSet="204" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/></Style>
            <Style ss:ID="s62" ss:Name="Гиперссылка"><Font ss:FontName="Calibri" x:CharSet="204" x:Family="Swiss" ss:Size="11" ss:Color="#0000FF" ss:Underline="Single"/></Style>
            <Style ss:ID="s63" ss:Parent="s62"><Alignment ss:Vertical="Bottom"/><Protection/></Style>
            <Style ss:ID="s71"><NumberFormat ss:Format="dd\\ mmm\\,\\ h:mm\\,\\ dddd"/></Style>
            <Style ss:ID="s73"><NumberFormat ss:Format="Short Time"/></Style>
            <Style ss:ID="s75"><NumberFormat ss:Format="h:mm;@"/></Style>
            <Style ss:ID="s76"><NumberFormat ss:Format="Standard"/></Style>
            <Style ss:ID="s78"><Alignment ss:Horizontal="Right"/></Style>
            <Style ss:ID="s79"><Alignment ss:Horizontal="Center"/></Style>
            <Style ss:ID="s80"><Alignment ss:Horizontal="Right"/></Style>
            <Style ss:ID="s81"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
            <Style ss:ID="s82"><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
            <Style ss:ID="s83" ss:Parent="s82"><NumberFormat ss:Format="Standard"/></Style>
            <Style ss:ID="s84" ss:Parent="s83"><Font ss:FontName="Calibri" x:CharSet="204" x:Family="Swiss" ss:Size="11" ss:Color="#000000" ss:Bold="1"/></Style>
            <Style ss:ID="s90"><Font ss:FontName="Calibri" x:CharSet="204" x:Family="Swiss" ss:Size="11" ss:Color="#000000" ss:Bold="1"/></Style>
            <Style ss:ID="s91" ss:Parent="s90">><Alignment ss:Horizontal="Center"/></Style>
            <Style ss:ID="s92" ss:Parent="s90">><Alignment ss:Horizontal="Right"/></Style>

        </Styles>
        <Worksheet ss:Name="Лист1">
            ${
                isSimple
                    ? `<Names><NamedRange ss:Name="_FilterDatabase" ss:RefersTo="=Лист1!R1C1:R65500C${filterColumns}" ss:Hidden="1"/></Names>`
                    : ''
            }
            ${
                isSimple
                    ? `<AutoFilter x:Range="R1C1:R65500C${filterColumns}" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>`
                    : ''
            }
            <Table>
                ${isSimple ? '' : '<Column ss:Width="35"/> <!-- planId -->'}
                <Column ss:Width="40"/> <!-- Group -->
                <Column ss:Width="130"/> <!-- fwdDateTime -->
                <Column ss:Width="75"/> <!-- fwdDeparture -->
                <Column ss:Width="80"/> <!-- fwdChange -->
                <Column ss:Width="60"/> <!-- fwdArrival -->
                <Column ss:Width="80"/> <!-- fwdArrivalTime -->
                <Column ss:Width="45"/> <!-- fwdDur -->
                ${
                    hasBackBlock
                        ? `
                  <Column ss:Width="130"/> <!-- backDateTime -->
                  <Column ss:Width="75"/> <!-- backDeparture -->
                  <Column ss:Width="80"/> <!-- backChange -->
                  <Column ss:Width="60"/> <!-- backArrival -->
                  <Column ss:Width="80"/> <!-- backArrivalTime -->
                  <Column ss:Width="45"/> <!-- backDur -->
                `
                        : ''
                }                
                <Column ss:Width="85"/> <!-- flightsDuration -->
                <Column ss:Width="50"/> <!-- price -->
                ${
                    hasBackBlock
                        ? `
                  <Column ss:Width="50"/> <!-- rate -->
                  <Column ss:Width="40"/> <!-- days -->
                  <Column ss:Width="70"/> <!-- travelDuration -->
                `
                        : ''
                }
                <Column ss:Width="50"/> <!-- link -->
                <Column ss:Width="50"/> <!-- link2 -->
                <Column ss:Width="10"/> <!-- spacer -->
                <Row>
                    ${isSimple ? '' : '<Cell ss:StyleID="s90"><Data ss:Type="String">planId</Data></Cell>'}
                    <Cell ss:StyleID="s90"><Data ss:Type="String">Group</Data>${
                        isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                    }</Cell>
                    <Cell ss:StyleID="s90"><Data ss:Type="String">fwdDateTime</Data>${
                        isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                    }</Cell>
                    <Cell ss:StyleID="${isSimple ? 's90' : 's91'}"><Data ss:Type="String">fwdDeparture</Data>${
            isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
        }</Cell>
                    <Cell ss:StyleID="s91"><Data ss:Type="String">fwdChange</Data>${
                        isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                    }</Cell>
                    <Cell ss:StyleID="${isSimple ? 's90' : 's91'}"><Data ss:Type="String">fwdArrival</Data>${
            isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
        }</Cell>
                    <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">fwdArrivalTime</Data>${
            isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
        }</Cell>
                    <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">fwdDur</Data>${
            isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
        }</Cell>
                    ${
                        hasBackBlock
                            ? `
                      <Cell ss:StyleID="s90"><Data ss:Type="String">backDateTime</Data>${
                          isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                      }</Cell>
                      <Cell ss:StyleID="${isSimple ? 's90' : 's91'}"><Data ss:Type="String">backDeparture</Data>${
                                  isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                              }</Cell>
                      <Cell ss:StyleID="s91"><Data ss:Type="String">backChange</Data>${
                          isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                      }</Cell>
                      <Cell ss:StyleID="${isSimple ? 's90' : 's91'}"><Data ss:Type="String">backArrival</Data>${
                                  isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                              }</Cell>
                      <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">backArrivalTime</Data>${
                                  isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                              }</Cell>
                      <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">backDur</Data>${
                                  isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                              }</Cell>
                    `
                            : ''
                    }
                    <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">flightsDuration</Data>${
            isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
        }</Cell>
                    <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">price</Data>${
            isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
        }</Cell>
                    ${
                        hasBackBlock
                            ? `
                      <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">rate</Data>${
                                  isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                              }</Cell>
                      <Cell ss:StyleID="${isSimple ? 's90' : 's92'}"><Data ss:Type="String">days</Data>${
                                  isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                              }</Cell>
                      <Cell ss:StyleID="s92"><Data ss:Type="String">travelDuration</Data>${
                          isSimple ? '<NamedCell ss:Name="_FilterDatabase"/>' : ''
                      }</Cell>
                    `
                            : ''
                    }
                    <Cell ss:StyleID="s90"><Data ss:Type="String">link</Data></Cell>
                    <Cell ss:StyleID="s90"><Data ss:Type="String">link2</Data></Cell>
                </Row>
                ${isSimple ? '' : `<Row>${'<Cell ss:StyleID="s81"/>'.repeat(filterColumns + 3)}</Row>`}                
                ${this.replaceMark}
            </Table>
            <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
                <Unsynced/>
                <Selected/>
                <FreezePanes/>
                <FrozenNoSplit/>
                <SplitHorizontal>1</SplitHorizontal>
                <TopRowBottomPane>1</TopRowBottomPane>
                <ActivePane>2</ActivePane>
                <Panes>
                    <Pane>
                        <Number>3</Number>
                    </Pane>
                    <Pane>
                        <Number>2</Number>
                    </Pane>
                </Panes>
                <ProtectObjects>False</ProtectObjects>
                <ProtectScenarios>False</ProtectScenarios>
            </WorksheetOptions>
        </Worksheet>
    </Workbook>
  `
    }
}
