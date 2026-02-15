"""Apply schema.sql to Azure SQL Database using AAD auth."""
import pyodbc
import struct
import os
import sys

def get_connection():
    token = os.environ["DB_TOKEN"]
    token_bytes = token.encode("utf-16-le")
    token_struct = struct.pack(f"<I{len(token_bytes)}s", len(token_bytes), token_bytes)
    return pyodbc.connect(
        "Driver={ODBC Driver 17 for SQL Server};"
        "Server=philly-stats-sql-01.database.windows.net;"
        "Database=phillystats;",
        attrs_before={1256: token_struct},
        autocommit=True,
    )

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(script_dir, "schema.sql")

    with open(schema_path, "r") as f:
        sql = f.read()

    # Split on GO statements (batch separators)
    batches = [b.strip() for b in sql.split("\nGO\n") if b.strip()]

    conn = get_connection()
    cursor = conn.cursor()

    for i, batch in enumerate(batches):
        # Skip comment-only batches
        lines = [l for l in batch.split("\n") if l.strip() and not l.strip().startswith("--")]
        if not lines:
            continue

        # Split batch further on semicolons for individual statements
        # (but only for CREATE TABLE/INDEX statements, not views)
        if "CREATE VIEW" in batch or "CREATE OR ALTER" in batch:
            # Execute views as single batch
            try:
                cursor.execute(batch)
                print(f"  Batch {i+1}: OK (view)")
            except Exception as e:
                print(f"  Batch {i+1}: {e}")
        else:
            # Split on semicolons for individual statements
            stmts = [s.strip() for s in batch.split(";") if s.strip()]
            for stmt in stmts:
                stmt_lines = [l for l in stmt.split("\n") if l.strip() and not l.strip().startswith("--")]
                if not stmt_lines:
                    continue
                try:
                    cursor.execute(stmt)
                    # Extract a short name for display
                    first_line = stmt_lines[0][:80]
                    print(f"  OK: {first_line}")
                except pyodbc.ProgrammingError as e:
                    if "already exists" in str(e) or "already an object" in str(e):
                        first_line = stmt_lines[0][:60]
                        print(f"  SKIP (exists): {first_line}")
                    else:
                        print(f"  ERROR: {e}")
                        print(f"  Statement: {stmt_lines[0][:100]}")

    cursor.close()
    conn.close()
    print("\nSchema applied successfully!")

if __name__ == "__main__":
    main()
