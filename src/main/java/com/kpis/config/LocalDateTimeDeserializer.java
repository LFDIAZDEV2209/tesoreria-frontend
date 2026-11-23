package com.kpis.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

public class LocalDateTimeDeserializer extends JsonDeserializer<LocalDateTime> {

    @Override
    public LocalDateTime deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        String dateString = p.getText();

        if (dateString == null || dateString.isEmpty()) {
            return null;
        }

        // Si ya tiene hora (contiene T), deserializar como LocalDateTime
        if (dateString.contains("T")) {
            return LocalDateTime.parse(dateString, DateTimeFormatter.ISO_DATE_TIME);
        }

        // Si solo tiene fecha, convertir a LocalDateTime con hora 00:00:00
        LocalDate date = LocalDate.parse(dateString, DateTimeFormatter.ISO_DATE);
        return date.atStartOfDay();
    }
}
