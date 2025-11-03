const X_ApiKeys = getApiKey();
var scanId = 4965;
var ticket= 7697083;
var dir_ip= "10.30.120.91";

// Escaneos calendarizados:
// Cedis RH8:8158
//RockyLinux8: 6692
// rhel9: 4261
// rhel8: 2464
// rhel7: 2634
// ws2022: 4965
// ws2019: 4968
// ws2016: 6678
// base de datos: 6489
// ws 2022 DC: 2979
// imagenes W11 6889
// imagenes W10 6845
//Afore RHEL7 8304
//Afore RHEL8 8301

function main() {
var Agent_info = list_agents(dir_ip);
Agent_info = get_asset_details(Agent_info);
Agent_info = get_scan_details(Agent_info);
Agent_info = buscarNegocio(Agent_info);
Agent_info = exportAndDownloadPDF(Agent_info);
google_sheets(Agent_info);
createDraftEmails(Agent_info);
}

function list_agents(ipv4) {
  Logger.log("Buscando el servidor en sensors");
  let url = 'https://cloud.tenable.com/scanners/null/agents?f=ip%3Aeq%3A'+ipv4;
  
  let headers = {
    'accept': 'application/json',
    'X-ApiKeys': X_ApiKeys
  };

  let options = {
    'method': 'get',
    'headers': headers,
    'muteHttpExceptions': true
  };

  let response = UrlFetchApp.fetch(url, options);
  try {
    var json = JSON.parse(response.getContentText());
    "Logger.log(JSON.stringify(json, null, 2));"
  } 
  catch (err) {
    Logger.log('Error: ' + err);
  }

 // Haciendo la busqueda y el parcing
  if (json && json.agents && json.agents.length > 0) {
    let agent = json.agents[0]; // Si solo te interesa el primer agente
    let Agent_info = {
      asset_uuid: agent.asset_uuid,
      status: agent.status,
      ip: agent.ip
    };

    Logger.log(JSON.stringify(Agent_info, null, 2)); // Imprimir el diccionario formateado
    return Agent_info; // Retornar el diccionario
  } else {
    Logger.log('No se encontraron agentes.');
    return null;
  } 

}

function get_asset_details(Agent_info) {
  Logger.log("Caracteristicas del servidor");
  var url = 'https://cloud.tenable.com/assets/'+Agent_info.asset_uuid;
  var headers = {
    'accept': 'application/json',
    'X-ApiKeys': X_ApiKeys
  };
  var options = {
    'method': 'get',
    'headers': headers,
    'muteHttpExceptions': true // Esto evita que se lancen errores en caso de respuestas HTTP no exitosas
  };

  try {
    response = UrlFetchApp.fetch(url, options);
    json = JSON.parse(response.getContentText());
  } catch (err) {
    Logger.log('Error al obtener la respuesta: ' + err);
    return; // Detener la ejecución si ocurre un error
  }

  // Verifica si el JSON tiene los campos esperados
  if (json) {
    // Extraer y agregar los nuevos datos al diccionario existente
    Agent_info.hostname = json.hostname && json.hostname.length > 0 ? json.hostname[0] : ""; // Obtener el primer elemento del array
    Agent_info.ipv4 = json.ipv4 && json.ipv4.length > 0 ? json.ipv4[0] : ""; // Obtener el primer elemento del array
    Agent_info.operating_system = json.operating_system && json.operating_system.length > 0 ? json.operating_system[0] : ""; // Obtener el primer elemento del array
    Agent_info.installed_software = json.installed_software ? json.installed_software : []; // Verificar si existe

    Logger.log(JSON.stringify(Agent_info, null, 2)); // Imprimir el diccionario formateado

    return Agent_info; // Retornar el diccionario al final de la ejecución
  } else {
    Logger.log('No se encontraron datos.');
  }

}

function get_scan_details(info_asset) {
  Logger.log("Obteniendo información del escaneo");
  var Agent_info = info_asset; // Asumimos que Agent_info es un diccionario

  var url = "https://cloud.tenable.com/scans/" + scanId;
  var headers = {
    "accept": "application/json",
    "X-ApiKeys": X_ApiKeys
  };
  var options = {
    'method': 'get',
    'headers': headers
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    const targetUuid = info_asset.asset_uuid;

    // Indicador para saber si encontramos el host
    let hostFound = false;

    // Buscamos el host en "hosts"
    const host = json.hosts.find(host => host.uuid === targetUuid);
    if (host) {
      Agent_info.low = host.low;
      Agent_info.medium = host.medium;
      Agent_info.high = host.high;
      Agent_info.critical = host.critical;
      hostFound = true; // Se encontró en hosts
    }

    // Buscamos el host en "comphosts"
    const compHost = json.comphosts.find(host => host.uuid === targetUuid);
    if (compHost) {
      Agent_info.comp_low = compHost.low;
      Agent_info.comp_critical = compHost.critical;
      hostFound = true; // Se encontró en comphosts
    }

    let new_Data = {
    ip : Agent_info.ipv4,
    hostname : Agent_info.hostname,
    so : Agent_info.operating_system,
    uuid : Agent_info.asset_uuid,
    Critico: Agent_info.critical,
    Alta: Agent_info.high,
    Med: Agent_info.medium,
    Baja: Agent_info.low,
    FAIL: Agent_info.comp_critical,
    PASS: Agent_info.comp_low
    };
    // Imprimimos el diccionario actualizado
    Logger.log(JSON.stringify(new_Data, null, 2));
    // Si no se encontró en ninguna de las listas, imprimir mensaje y retornar
    if (!hostFound) {
      Logger.log("No se encontró el servidor en el escaneo");
      return; // Terminar la ejecución
    }

    return Agent_info;

  } catch (err) {
    Logger.log('Error al obtener la respuesta: ' + err);
    return; // Detener la ejecución si ocurre un error
  }
}

function buscarNegocio(Agent_info) {
  var ipv4 = Agent_info.ip;
  var sheetId = '1G2estBjur0S8U7R-FgQNhanntDDiE4LVlHjfBI1GBdE';
  var sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Info nueva');

  // Obtener el rango de la columna P
  var rangoP = sheet.getRange("P:P");
  var valoresP = rangoP.getValues();

  // Bandera para indicar si se encontró el valor
  var encontrado = false;

  // Buscar el valor de ipv4 en la columna P
  for (var i = 0; i < valoresP.length; i++) {
    if (valoresP[i][0] == ipv4) {
      // Obtener el valor de la columna B en la misma fila
      var valorB = sheet.getRange(i+1, 2).getValue();

      // Agregar el valor al diccionario Agent_info
      Agent_info.Entorno = valorB;
      Logger.log('El entorno es: ' + Agent_info.Entorno);
      encontrado = true;
      break;
    }
  }

  // Si no se encontró el valor, asignar "No encontrado"
  if (!encontrado) {
    Agent_info.Entorno = "No encontrado";
    Logger.log('El servidor no se encontró en el registro de fabrica de recuperacion.');
  }

  // Devolver el diccionario modificado
  return Agent_info;
}

function exportAndDownloadPDF(Agent_info) {

    var url = 'https://cloud.tenable.com/scans/' + scanId + '/export';
    var payload = {
      "format": "pdf",
      //"chapters": "vuln_hosts_summary;audits",
      "chapters": "vuln_by_host;vuln_hosts_summary; remediations",
      //"chapters": "vuln_by_host;vuln_hosts_summary;audits; remediations",
      "filter.0.filter": "host.target",
      "filter.0.quality": "eq",
      "filter.0.value": Agent_info.ip,
      "filter.search_type": "and",
      "asset_id": "4141"
    };

    var headers = {
      "accept": "application/json",
      "content-type": "application/json",
      "X-ApiKeys": X_ApiKeys
    };

    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'headers': headers,
      'payload': JSON.stringify(payload)
    };
    Utilities.sleep(2000);
    var response = UrlFetchApp.fetch(url, options);
    Utilities.sleep(2000);
    var jsonResponse = JSON.parse(response.getContentText());
    var fileId = jsonResponse['file'];
    Logger.log("Generando Reporte ...");
    //Logger.log(fileId);


    var statusUrl = 'https://cloud.tenable.com/scans/' + scanId + '/export/' + fileId + '/status';

    var isReady = false;
    while (!isReady) {
      var statusResponse = UrlFetchApp.fetch(statusUrl, {
        'method': 'get',
        'headers': headers
      });
      var statusJson = JSON.parse(statusResponse.getContentText());
      if (statusJson.status === 'ready') {
        isReady = true;
      } else {
        Logger.log("Descargando Reporte ...");
        Utilities.sleep(5000);
      }
    }

    var downloadUrl = 'https://cloud.tenable.com/scans/' + scanId + '/export/' + fileId + '/download';

    var downloadHeaders = {
      "accept": "application/octet-stream",
      "X-ApiKeys": X_ApiKeys
    };

    var downloadOptions = {
      'method': 'get',
      'headers': downloadHeaders,
       muteHttpExceptions: true
    };

  var folderId;
      // Seleccion de folder
        if (Agent_info.Entorno.includes("Cartera")) {
            folderId = '1XEcbjt77xmcL4I5ia_O-WQcCp2g10iLz'; // folder Cartera
            Logger.log("Se seleccionó la carpeta Cartera");
        } else if (Agent_info.Entorno === "No encontrado") {
            Logger.log("No se encontro el proceso de negocio en GV Contingencia, se agrega a carpeta No encontrado");
            folderId = '1pdu2CMTlcbv01Wqo4dFFNSL5q0Fz5QKe'; // folder Desconocido
        } else if (Agent_info.Entorno.includes("Afore")) {
            folderId = '1EfrP0orZon42D8ImAcKbNKRzbL3DvC-X'; // folder Afore
            Logger.log("Se seleccionó la carpeta Afore");
        } else if (Agent_info.Entorno.includes("Finanzas")) {
            folderId = '1va6536O5w10Sbqq2wEimVwT8QfhpJ3ps'; // folder Finanzas
            Logger.log("Se seleccionó la carpeta Finanzas");
        } else if (Agent_info.Entorno.includes("Ropa")) {
            folderId = '16lTjcqbU5mIZmCSrMM5-nSGa-9XsZOB9'; // folder Ropa
            Logger.log("Se seleccionó la carpeta Ropa");
        } else if (Agent_info.Entorno.includes("Mueble")) {
            folderId = '14LGCoDecL1nZtR9G_Zt6RkXKu6VOKNJS'; // folder Muebles
            Logger.log("Se seleccionó la carpeta Mueble");
        } else if (Agent_info.Entorno.includes("Construccion")) {
            folderId = '1KTXEzn8BWIYtV8UGLTOZ5eSz3UFvytBs'; // folder Diseño y construccion
            Logger.log("Se seleccionó la carpeta Diseño y construccion");
        }else if (Agent_info.Entorno.includes("Operación Tienda")) {
          folderId = '1FXD2lTI6ssAgTXDHI4bH0AK-RakfNzQ7'; // folder Operación Tienda
          Logger.log("Se seleccionó la carpeta Operación Tienda");
        } else if (Agent_info.Entorno.includes("Abonos")) {
            folderId = '1IkboMVYCdblHQa1v8ChbStcLDV1wEtvr'; // folder Abonos y Préstamos
            Logger.log("Se seleccionó la carpeta Abonos y Préstamos");

        //Cambio David, borrar despues de revision.
        } else if (Agent_info.Entorno.includes("APIGee")) {
            folderId = '1_8a4Em_jSYD-O7M33wtomdbkbLT7Xspx'; // folder APIGee GCP
            Logger.log("Se seleccionó la carpeta APIGee GCP");
        } else if (Agent_info.Entorno === "Argentina") {
            folderId = '1nTFZGNVQtadO1DLSGX4jShZ9h0hS7Gy3'; // folder Argentina
            Logger.log("Se seleccionó la carpeta Argentina");
        } else if (Agent_info.Entorno.includes("Argentina - Cartera")) {
            folderId = '1-LNHLjcEv6K2nHMldWvIwGGrhACUshKx'; // folder Argentina - Carteras
            Logger.log("Se seleccionó la carpeta Argentina - Carteras");
        } else if (Agent_info.Entorno.includes("Argentina - Cobranza")) {
            folderId = '1030K96PkwleMiUI62qXkUCn6v1bfDlDV'; // folder Argentina - Cobranza
            Logger.log("Se seleccionó la carpeta Argentina - Cobranza");
        } else if (Agent_info.Entorno.includes("Argentina - Compras Ropa")) {
            folderId = '1ZIyY8bB6Ujx0GG-TQRx25touzsUtQZg_'; // folder Argentina - Compras Ropa
            Logger.log("Se seleccionó la carpeta Argentina - Compras Ropa");
        } else if (Agent_info.Entorno.includes("Argentina - eCommerce")) {
            folderId = '1dI7CdAjJxF8RIdR1Aj-r0lA4I2hm8v5q'; // folder Argentina - eCommerce
            Logger.log("Se seleccionó la carpeta Argentina - eCommerce");
        } else if (Agent_info.Entorno.includes("Argentina - Finanzas")) {
            folderId = '1wztWHVpBU-17FvwiCLqiTEdVJQZ_azPj'; // folder Argentina - Finanzas
            Logger.log("Se seleccionó la carpeta Argentina - Finanzas");
        } else if (Agent_info.Entorno.includes("Argentina - RRHH")) {
            folderId = '1uztaJ7RpMu2jpm-otoLNxCFnO6x15K9j'; // folder Argentina - RRHH
            Logger.log("Se seleccionó la carpeta Argentina - RRHH");
        } else if (Agent_info.Entorno.includes("Auditoría")) {
            folderId = '1Vmipv7h9goWRtSI5Lh7Olk1jSEwAR4mH'; // folder Auditoría
            Logger.log("Se seleccionó la carpeta Auditoría");
        } else if (Agent_info.Entorno.includes("Banco")) {
            folderId = '10yxYKTS4LDD5PmPnF5QvHqTPzoYzggMH'; // folder Banco
            Logger.log("Se seleccionó la carpeta Banco");
        } else if (Agent_info.Entorno.includes("Cadena")) {
            folderId = '1Dfhgb7PMouYz0WiCwvA7-epT41PlxTas'; // folder Cadena de Suministro
            Logger.log("Se seleccionó la carpeta Cadena de Suministro");
        } else if (Agent_info.Entorno.includes("Cajas de A")) {
            folderId = '1Ti0hhu35UvfRGtOUImM0_TON584hIxg3'; // folder Cajas de Abono
            Logger.log("Se seleccionó la carpeta Cajas de Abono");
        } else if (Agent_info.Entorno.includes("CES")) {
            folderId = '1sMhwJpt6FqxIFBCvCtgWJU9hlzfSGDLt'; // folder CES
            Logger.log("Se seleccionó la carpeta CES");
        } else if (Agent_info.Entorno.includes("Ciencia")) {
            folderId = '11ugZLPYVb_MluunRikQxV-zshqAVQwiJ'; // folder Ciencia de datos
            Logger.log("Se seleccionó la carpeta Ciencia de datos");
        } else if (Agent_info.Entorno.includes("Cobranza")) {
            folderId = '1y-bHSfXEov7jQrTwRLtGu7NpEl3il-_P'; // folder Cobranza
            Logger.log("Se seleccionó la carpeta Cobranza");
        } else if (Agent_info.Entorno.includes("Compras interna")) {
            folderId = '1yHfR9_B9G57NJQDdsth1tZ_5khgz0_cc'; // folder Compras internas
            Logger.log("Se seleccionó la carpeta Compras internas");
        } else if (Agent_info.Entorno.includes("Compras Muebles")) {
            folderId = '14LGCoDecL1nZtR9G_Zt6RkXKu6VOKNJS'; // folder Compras Muebles
            Logger.log("Se seleccionó la carpeta Compras Muebles");
        } else if (Agent_info.Entorno.includes("Compras Ropa")) {
            folderId = '16lTjcqbU5mIZmCSrMM5-nSGa-9XsZOB9'; // folder Compras Ropa
            Logger.log("Se seleccionó la carpeta Compras Ropa");
        } else if (Agent_info.Entorno.includes("Compras Tienda")) {
            folderId = '1Ht4CVhc3lIncu8VwTarcwj5HvWbtTmtb'; // folder Compras Tienda
            Logger.log("Se seleccionó la carpeta Compras Tienda");
        } else if (Agent_info.Entorno.includes("Crédito")) {
            folderId = '1_wb-YdbWmmdQ0YDBJo4Ur-80DMkvg08x'; // folder Crédito
            Logger.log("Se seleccionó la carpeta Crédito");
        } else if (Agent_info.Entorno.includes("CRM")) {
            folderId = '1ltjpZpYHSTM-JgECAbRCirF_x9_bvttJ'; // folder CRM (Customer Relationship Management)
            Logger.log("Se seleccionó la carpeta CRM (Customer Relationship Management)");
        } else if (Agent_info.Entorno.includes("División Administrativa")) {
            folderId = '1-KOs1WPLvYo55SiSwzuSMVNoe2Yqs8MH'; // folder División Administrativa)
            Logger.log("Se seleccionó la carpeta División Administrativa");
        } else if (Agent_info.Entorno.includes("Ecommerce")) {
            folderId = '1Ti0hhu35UvfRGtOUImM0_TON584hIxg3'; // folder Ecommerce)
            Logger.log("Se seleccionó la carpeta Ecommerce");
        } else if (Agent_info.Entorno.includes("Exhibición")) {
            folderId = '1BLAOYGW-YRNpA26lOcpYyhdbeOamXoMZ'; // folder Exhibición)
            Logger.log("Se seleccionó la carpeta Exhibición");
        } else if (Agent_info.Entorno.includes("Fundación")) {
            folderId = '1Iz-ZyB45cUkbxQBMabPsyfHr-ipHooHF'; // folder Fundación)
            Logger.log("Se seleccionó la carpeta Fundación");
        } else if (Agent_info.Entorno.includes("Importaciones")) {
            folderId = '12v89N-ZmJAafFqjVWsGhghd2_YHQk-9w'; // folder Importaciones)
            Logger.log("Se seleccionó la carpeta Importaciones");
        } else if (Agent_info.Entorno.includes("Infraestructura Tecnológica")) {
            folderId = '15ptFQkU0Mgc3AphSx5234q1YF1w-cMYn'; // folder Infraestructura Tecnológica)
            Logger.log("Se seleccionó la carpeta Infraestructura Tecnológica");
        } else if (Agent_info.Entorno.includes("Inmobiliaria")) {
            folderId = '15ptFQkU0Mgc3AphSx5234q1YF1w-cMYn'; // folder Inmobiliaria)
            Logger.log("Se seleccionó la carpeta Inmobiliaria");
        } else if (Agent_info.Entorno.includes("Inteligencia")) {
            folderId = '1qNz5yeTO8dIEG6gG_fPh_295sFspnr7f'; // folder Inteligencia y Prevención del Delito)
            Logger.log("Se seleccionó la carpeta Inteligencia y Prevención del Delito");
        } else if (Agent_info.Entorno.includes("Jurídico")) {
            folderId = '1APJ2J58-SZWBMdkl9u2cwtp00c5xeggh'; // folder Jurídico)
            Logger.log("Se seleccionó la carpeta Jurídico");
        } else if (Agent_info.Entorno.includes("Mejora Continua")) {
            folderId = '1je6mkqYDy_Z_vMUTJhSLqthZ4C-3BDF6'; // folder Mejora Continua)
            Logger.log("Se seleccionó la carpeta Mejora Continua");
        } else if (Agent_info.Entorno.includes("Mercadotecnia")) {
            folderId = '1AHcFCobk7po_dlzw_bGPe2cgWPN5JHnN'; // folder Mercadotecnia)
            Logger.log("Se seleccionó la carpeta Mercadotecnia");
        } else if (Agent_info.Entorno.includes("Nomina")) {
            folderId = '1TFLBiQOU5EwsPq4PpCKA0wqJAbt0YESR'; // folder Nominas y Beneficio)
            Logger.log("Se seleccionó la carpeta Nominas y Beneficio");
        } else if (Agent_info.Entorno.includes("Seguridad de la Información")) {
            folderId = '13A_SWg1MVooo9WRQENmV8Cxn2IUBeQDg'; // folder Seguridad de la Información)
            Logger.log("Se seleccionó la carpeta Seguridad de la Información");
        } else if (Agent_info.Entorno.includes("Seguridad Patrimonial")) {
            folderId = '1Dj-c87-HPqUdGny-PYKJIc5sRYxvwaBi'; // folder Seguridad Patrimonial)
            Logger.log("Se seleccionó la carpeta Seguridad Patrimonial");
        } else if (Agent_info.Entorno.includes("Seguros")) {
            folderId = '1PEQsXbIu3xn3xtUF3g2YdB2LwCr7M_wa'; // folder Seguros)
            Logger.log("Se seleccionó la carpeta Seguros");
        } else if (Agent_info.Entorno.includes("Talento y Desarrollo")) {
            folderId = '18f81VttkSKk7BhfaxxZCUhexKiH6ptmN'; // folder Talento y Desarrollo)
            Logger.log("Se seleccionó la carpeta Talento y Desarrollo");
        } else if (Agent_info.Entorno.includes("Tecnologia de la informacion")) {
            folderId = '13kAtVUh_sWdicCELKJ7A7gk0tasnEte8'; // folder Tecnologia de la Informacion)
            Logger.log("Se seleccionó la carpeta Tecnologia de la informacion 2");

        } else {
            Logger.log("No se encontró el área de negocio");
            return 0; // Salir de la función si no se encuentra el área de negocio
        }



  var folder = DriveApp.getFolderById(folderId);  
  var newFolder = folder.createFolder(ticket.toString());
  Logger.log('Se crea carpeta:' + ticket);
  // 1. Descarga el PDF desde la URL especificada
  var downloadResponse = UrlFetchApp.fetch(downloadUrl, downloadOptions);
  // 2. Convierte la respuesta en un Blob
  var pdfBlob = downloadResponse.getBlob();
  // 3. Asegura que el Blob se maneje como PDF
  var mimeType = 'application/pdf'; 
  pdfBlob.setContentType(mimeType);
  // 4. Define el nombre del archivo, agregando la extensión .pdf
  var fileName = 'VA_HA_' + Agent_info.hostname + '_' + Agent_info.ip + '.pdf';
  pdfBlob.setName(fileName);
  // 5. Crea el archivo en la carpeta de Google Drive y le asigna el nombre correcto
  var file = newFolder.createFile(pdfBlob);


  var fileId = file.getId();
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  var shareableLink = file.getUrl();
  Logger.log('Shareable Link:');
  Logger.log(shareableLink);
  Agent_info.ReportesVA_HA = shareableLink;



  // Logger.log("Nueva Lista: " + JSON.stringify(Agent_info));	
  return Agent_info;
}

function google_sheets(resultado) {
  let Agent_info = resultado;
  // Abrir la hoja de cálculo por su ID
  let creador = Session.getEffectiveUser().getEmail();
  let fechaHoy = obtenerFechaActual();
  let doc = SpreadsheetApp.openById("1tbO266uovhLs18UeQd1f97QS7qAUv0bBMNEq3VnXYwY");
  // Obtener la hoja por su nombre
  let sheet = doc.getSheetByName("SO");
  // Recorrer la lista de resultados

  Agent_info['total'] = 
  Number(Agent_info.low) + 
  Number(Agent_info.medium) + 
  Number(Agent_info.high) + 
  Number(Agent_info.critical);

  // Crear un objeto para almacenar los datos de la fila
  const rowData = {
    ticket: ticket,
    fechaHoy: fechaHoy,
    ip: Agent_info.ip,
    operating_system: Agent_info.operating_system,
    critical: Agent_info.critical,
    high: Agent_info.high,
    medium: Agent_info.medium,
    low: Agent_info.low,
    total: Agent_info.total,
    comp_critical: Agent_info.comp_critical,
    comp_low: Agent_info.comp_low,
    creador: creador,
    ReportesVA_HA: Agent_info.ReportesVA_HA,
    Entorno: Agent_info.Entorno
  };

  // Extraer los valores del objeto rowData y crear un array
  const rowValues = [
    rowData.ticket,
    rowData.fechaHoy,
    rowData.ip,
    rowData.operating_system,
    rowData.critical,
    rowData.high,
    rowData.medium,
    rowData.low,
    rowData.total,
    rowData.comp_critical,
    rowData.comp_low,
    rowData.creador,
    rowData.ReportesVA_HA,
    rowData.Entorno,
  ];

    // Escribir la matriz en la última fila de la hoja
    Logger.log("Insertando fila en Sheet: Registro Gestion de Vulnerabilidades");
    Logger.log(rowValues);
    sheet.appendRow(rowValues);
}
  

function createDraftEmails(dataList) {

    const data = dataList;
    const subject = `${data.Entorno} - Reporte de vulnerabilidades - ${data['hostname']} - ${data['ip']}`;
    
    // Carga el contenido HTML desde el archivo "Tabla.html"
    let htmlContent = HtmlService.createHtmlOutputFromFile('Tabla').getContent();
    
    // Reemplaza las variables en el contenido HTML
    htmlContent = htmlContent.replace(/{{data\['hostname'\]}}/g, data['hostname'])
      .replace(/{{data\['ip'\]}}/g, data['ip'])
      .replace(/{{data\['critical'\]}}/g, data['critical'])
      .replace(/{{data\['high'\]}}/g, data['high'])
      .replace(/{{data\['medium'\]}}/g, data['medium'])
      .replace(/{{data\['low'\]}}/g, data['low'])
      .replace(/{{data\['comp_critical'\]}}/g, data['comp_critical'])
      .replace(/{{data\['comp_low'\]}}/g, data['comp_low'])
      .replace(/{{data\['ReportesVA_HA'\]}}/g, data['ReportesVA_HA'])
      .replace(/{{data\['installed_software'\]}}/g, data['installed_software']);
    
    // Destinatarios ficticios (puedes editarlos después)
    const recipients = 'francisco.palos@coppel.com, , ';
    const ccRecipients = 'giovanni.flores@coppel.com, orlando.acuna@coppel.com, ';
    
    // Crea el borrador del correo
    const draft = GmailApp.createDraft(recipients, subject, '', {
      cc: ccRecipients,
      htmlBody: htmlContent
    });
    
    // Imprime un mensaje de éxito
    Logger.log(`Borrador de correo creado para ${data['ipv4']}`);
  }




function obtenerFechaActual() {
  const fecha = new Date();
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2,   
 '0');
  const anio = fecha.getFullYear();
  return `${dia}/${mes}/${anio}`;   

}

  


"_____________________________________"
function getApiKey() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const apiKey = scriptProperties.getProperty('Tenable_Api_key');
  return apiKey;
}

